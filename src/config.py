"""User configuration: load, validate, normalise."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Optional

import yaml


@dataclass
class EVConfig:
    enabled: bool = False
    annual_kwh: float = 0
    can_schedule_charging: bool = False


@dataclass
class CurrentPlan:
    plan_id: str
    discount_expires_on: Optional[date] = None


@dataclass
class ElectricityConfig:
    annual_kwh: float
    meter_type: str                       # smart | day_night | standard_24hr
    current_plan: CurrentPlan
    hdf_csv_path: Optional[Path] = None
    ev_start_date: Optional[date] = None
    ev: EVConfig = field(default_factory=EVConfig)


@dataclass
class GasConfig:
    annual_kwh: float
    current_plan: CurrentPlan


@dataclass
class HouseholdConfig:
    occupants: int = 1
    eircode_prefix: str = ""
    notes: str = ""


@dataclass
class OutputConfig:
    html_path: Path = Path("report.html")
    title: str = "Energy Switch Recommendation"


@dataclass
class UserConfig:
    household: HouseholdConfig
    electricity: ElectricityConfig
    gas: Optional[GasConfig]
    output: OutputConfig
    # Optional: user-supplied corrections to the shipped tariff catalogue.
    # tariff_overrides: dict of plan_id -> partial plan dict (top-level
    # fields are replaced). E.g. {"flogas_ev_night_charge_2026q2":
    # {"standing_eur_per_year": 320.0, "welcome_credit_eur": 50}}.
    # custom_electricity_plans / custom_gas_plans: lists of full plan dicts
    # in the same shape as tariffs/*.yaml entries.
    tariff_overrides: dict = field(default_factory=dict)
    custom_electricity_plans: list = field(default_factory=list)
    custom_gas_plans: list = field(default_factory=list)
    # custom_combos: list of {electricity_id, gas_id, label} to add to the
    # ranking on top of the curated big-six combos. Lets users see their
    # custom_*_plans (or any catalogue plan combo we haven't included by
    # default) ranked alongside the standard list.
    custom_combos: list = field(default_factory=list)


def _as_date(v) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def _parse_current_plan(raw: dict) -> CurrentPlan:
    return CurrentPlan(
        plan_id=raw["plan_id"],
        discount_expires_on=_as_date(raw.get("discount_expires_on")),
    )


def load_config(path: Path) -> UserConfig:
    raw = yaml.safe_load(Path(path).read_text())

    h_raw = raw.get("household", {}) or {}
    household = HouseholdConfig(
        occupants=h_raw.get("occupants", 1),
        eircode_prefix=h_raw.get("eircode_prefix", ""),
        notes=h_raw.get("notes", ""),
    )

    e_raw = raw["electricity"]
    ev_raw = e_raw.get("ev") or {}
    electricity = ElectricityConfig(
        annual_kwh=float(e_raw["annual_kwh"]),
        meter_type=e_raw.get("meter_type", "smart"),
        current_plan=_parse_current_plan(e_raw["current_plan"]),
        hdf_csv_path=Path(e_raw["hdf_csv_path"]) if e_raw.get("hdf_csv_path") else None,
        ev_start_date=_as_date(e_raw.get("ev_start_date")),
        ev=EVConfig(
            enabled=ev_raw.get("enabled", False),
            annual_kwh=float(ev_raw.get("annual_kwh", 0) or 0),
            can_schedule_charging=ev_raw.get("can_schedule_charging", False),
        ),
    )

    gas = None
    if "gas" in raw and raw["gas"]:
        g_raw = raw["gas"]
        gas = GasConfig(
            annual_kwh=float(g_raw["annual_kwh"]),
            current_plan=_parse_current_plan(g_raw["current_plan"]),
        )

    o_raw = raw.get("output", {}) or {}
    output = OutputConfig(
        html_path=Path(o_raw.get("html_path", "report.html")),
        title=o_raw.get("title", "Energy Switch Recommendation"),
    )

    return UserConfig(
        household=household,
        electricity=electricity,
        gas=gas,
        output=output,
        tariff_overrides=raw.get("tariff_overrides", {}) or {},
        custom_electricity_plans=raw.get("custom_electricity_plans", []) or [],
        custom_gas_plans=raw.get("custom_gas_plans", []) or [],
        custom_combos=raw.get("custom_combos", []) or [],
    )


def validate(cfg: UserConfig, electricity_plans: dict, gas_plans: dict) -> list[str]:
    """Return a list of human-readable validation errors (empty = OK)."""
    errors: list[str] = []
    if cfg.electricity.annual_kwh <= 0:
        errors.append("electricity.annual_kwh must be > 0")
    if cfg.electricity.current_plan.plan_id not in electricity_plans:
        errors.append(
            f"electricity.current_plan.plan_id {cfg.electricity.current_plan.plan_id!r} "
            f"not found in tariffs/electricity.yaml"
        )
    if cfg.electricity.hdf_csv_path is not None and not cfg.electricity.hdf_csv_path.exists():
        errors.append(f"electricity.hdf_csv_path does not exist: {cfg.electricity.hdf_csv_path}")
    if cfg.electricity.ev.enabled and cfg.electricity.ev.annual_kwh <= 0:
        errors.append("electricity.ev.enabled is true but ev.annual_kwh is not set")
    if cfg.gas is not None:
        if cfg.gas.annual_kwh <= 0:
            errors.append("gas.annual_kwh must be > 0")
        if cfg.gas.current_plan.plan_id not in gas_plans:
            errors.append(
                f"gas.current_plan.plan_id {cfg.gas.current_plan.plan_id!r} "
                f"not found in tariffs/gas.yaml"
            )
    return errors
