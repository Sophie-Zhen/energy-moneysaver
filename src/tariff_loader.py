"""Load tariff plans from YAML and normalise into the dict shape the
simulator expects.

YAML schema (see tariffs/electricity.yaml and tariffs/gas.yaml) carries more
metadata than the simulator needs (provenance, contract terms, etc.). This
module reshapes each YAML record so the simulator's hot path stays simple.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent
ELECTRICITY_YAML = _REPO_ROOT / "tariffs" / "electricity.yaml"
GAS_YAML = _REPO_ROOT / "tariffs" / "gas.yaml"
HIKES_YAML = _REPO_ROOT / "tariffs" / "hikes.yaml"


# --------------------------- electricity ---------------------------

def _convert_electricity_plan(raw: dict) -> dict:
    rates = raw["rates_inc_vat"]
    out: dict[str, Any] = {
        "id": raw["id"],
        "label": raw["label"],
        "supplier": raw["supplier"],
        "category": raw.get("category", "new_customer_offer"),
        "kind": rates["kind"],
        "standing_eur_per_year": raw["standing_eur_per_year"],
        "welcome_credit_eur": raw.get("welcome_credit_eur", 0),
        "discount_pct": raw.get("discount_pct", 0),
        "contract_months": raw.get("contract_months", 0),
        "exit_fee_eur": raw.get("exit_fee_eur"),
        "requires_dual_fuel": raw.get("requires_dual_fuel", False),
        "requires_ev": raw.get("requires_ev", False),
        "source": raw.get("source", {}),
    }
    if rates["kind"] == "flat":
        out["rate_cpkwh"] = rates["rate_cpkwh"]
    elif rates["kind"] == "bands":
        out["bands"] = [
            ((b["hours"][0], b["hours"][1]), b["rate_cpkwh"])
            for b in rates["bands"]
        ]
    else:
        raise ValueError(f"Unknown rate kind: {rates['kind']!r} in plan {raw['id']!r}")
    return out


def _convert_gas_plan(raw: dict) -> dict:
    return {
        "id": raw["id"],
        "label": raw["label"],
        "supplier": raw["supplier"],
        "category": raw.get("category", "new_customer_offer"),
        "rate_cpkwh": raw["rate_cpkwh_inc_vat"],
        "standing_eur_per_year": raw["standing_eur_per_year"],
        "welcome_credit_eur": raw.get("welcome_credit_eur", 0),
        "discount_pct": raw.get("discount_pct", 0),
        "contract_months": raw.get("contract_months", 0),
        "exit_fee_eur": raw.get("exit_fee_eur"),
        "requires_dual_fuel": raw.get("requires_dual_fuel", False),
        "requires_dual_fuel_with": raw.get("requires_dual_fuel_with"),
        "source": raw.get("source", {}),
    }


@dataclass
class TariffSnapshot:
    electricity: dict[str, dict]
    gas: dict[str, dict]
    hikes: list[dict]
    last_verified: dict[str, str]  # file -> ISO date


def load_all(
    electricity_path: Path = ELECTRICITY_YAML,
    gas_path: Path = GAS_YAML,
    hikes_path: Path = HIKES_YAML,
) -> TariffSnapshot:
    e_raw = yaml.safe_load(electricity_path.read_text())
    g_raw = yaml.safe_load(gas_path.read_text())
    h_raw = yaml.safe_load(hikes_path.read_text())

    return TariffSnapshot(
        electricity={p["id"]: _convert_electricity_plan(p) for p in e_raw["plans"]},
        gas={p["id"]: _convert_gas_plan(p) for p in g_raw["plans"]},
        hikes=h_raw.get("hikes", []) or [],
        last_verified={
            "electricity": str(e_raw["last_verified"]),
            "gas": str(g_raw["last_verified"]),
            "hikes": str(h_raw["last_verified"]),
        },
    )


# --------------------------- hike application ---------------------------

def apply_electricity_hike(plan: dict, pct: float) -> dict:
    """Return a new plan with all rates scaled by (1 + pct/100)."""
    scale = 1 + pct / 100
    new = dict(plan)
    if plan["kind"] == "flat":
        new["rate_cpkwh"] = plan["rate_cpkwh"] * scale
    elif plan["kind"] == "bands":
        new["bands"] = [((lo, hi), r * scale) for (lo, hi), r in plan["bands"]]
    new["label"] = f'{plan["label"]} [post +{pct}% hike]'
    return new


def apply_gas_hike(plan: dict, pct: float) -> dict:
    new = dict(plan)
    new["rate_cpkwh"] = plan["rate_cpkwh"] * (1 + pct / 100)
    new["label"] = f'{plan["label"]} [post +{pct}% hike]'
    return new


# --------------------------- user overrides ---------------------------

def apply_user_overrides(
    snapshot: TariffSnapshot,
    overrides: dict,
    custom_electricity: list,
    custom_gas: list,
) -> TariffSnapshot:
    """Apply user-supplied tariff data on top of the shipped snapshot.

    `overrides` maps plan_id -> partial plan dict. Each top-level key in
    the override replaces the corresponding key on the base plan. Sub-dicts
    (notably `rates_inc_vat`) are replaced wholesale, not deep-merged.

    `custom_electricity` and `custom_gas` are full plan dicts in YAML schema
    format (the loader reshapes them through the same _convert_* functions).
    Custom plans whose id collides with the shipped catalogue are rejected
    with a clear error.
    """
    new_electricity = dict(snapshot.electricity)
    new_gas = dict(snapshot.gas)

    for plan_id, patch in overrides.items():
        if plan_id in new_electricity:
            new_electricity[plan_id] = _override_electricity(new_electricity[plan_id], patch)
        elif plan_id in new_gas:
            new_gas[plan_id] = _override_gas(new_gas[plan_id], patch)
        else:
            raise ValueError(
                f"tariff_overrides: plan_id {plan_id!r} not found in "
                f"electricity or gas catalogue."
            )

    for raw in custom_electricity:
        plan = _convert_electricity_plan(raw)
        if plan["id"] in new_electricity:
            raise ValueError(
                f"custom_electricity_plans: id {plan['id']!r} collides with "
                f"shipped catalogue. Use tariff_overrides to modify it."
            )
        new_electricity[plan["id"]] = plan

    for raw in custom_gas:
        plan = _convert_gas_plan(raw)
        if plan["id"] in new_gas:
            raise ValueError(
                f"custom_gas_plans: id {plan['id']!r} collides with shipped "
                f"catalogue. Use tariff_overrides to modify it."
            )
        new_gas[plan["id"]] = plan

    return TariffSnapshot(
        electricity=new_electricity,
        gas=new_gas,
        hikes=snapshot.hikes,
        last_verified=snapshot.last_verified,
    )


def _override_electricity(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in patch.items():
        if k == "rates_inc_vat":
            # User provides full new rates_inc_vat block — re-shape through
            # converter to keep `kind`/`bands` invariants.
            faux_raw = dict(base.get("_raw", {}))
            faux_raw["rates_inc_vat"] = v
            if v.get("kind") == "flat":
                out["kind"] = "flat"
                out["rate_cpkwh"] = v["rate_cpkwh"]
                out.pop("bands", None)
            elif v.get("kind") == "bands":
                out["kind"] = "bands"
                out["bands"] = [
                    ((b["hours"][0], b["hours"][1]), b["rate_cpkwh"])
                    for b in v["bands"]
                ]
                out.pop("rate_cpkwh", None)
            else:
                raise ValueError(
                    f"tariff_overrides: unknown rates_inc_vat kind {v.get('kind')!r}"
                )
        else:
            out[k] = v
    out["label"] = out["label"] + " [USER OVERRIDE]"
    # A direct {"kind": "bands"} override skips the rates_inc_vat reshaping above
    # and can leave kind without matching bands. Fail here with a clear message
    # instead of a cryptic KeyError deep in the simulator.
    if out.get("kind") == "bands" and not out.get("bands"):
        raise ValueError(
            f"tariff_overrides for {base.get('id', '?')!r}: kind='bands' but no "
            f"'bands'. Change rates through a full 'rates_inc_vat' block, not by "
            f"setting 'kind' directly."
        )
    return out


def _override_gas(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in patch.items():
        if k == "rate_cpkwh_inc_vat":
            out["rate_cpkwh"] = v
        else:
            out[k] = v
    out["label"] = out["label"] + " [USER OVERRIDE]"
    return out


# --------------------------- staleness ---------------------------

def staleness_level(last_verified: str, today: date | None = None) -> str:
    """Return 'fresh', 'warn' (60-119 days), or 'critical' (>=120 days)."""
    today = today or date.today()
    verified = date.fromisoformat(last_verified)
    age_days = (today - verified).days
    if age_days < 60:
        return "fresh"
    if age_days < 120:
        return "warn"
    return "critical"
