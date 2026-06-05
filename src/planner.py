"""Pick which (electricity, gas) combos to compare for a given user.

For v0 the set of switch options is a curated list — every entry maps to a
real plan in tariffs/electricity.yaml + tariffs/gas.yaml. When the catalogue
expands beyond the big-six smart-meter sample, this will become data-driven
via tariffs/combos.yaml.

The user's current plan is added as a BASELINE row, and (when their
supplier has an announced hike or a "post discount expiry" trap) a
DO-NOTHING row is added so the report can quantify the cost of inaction.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from . import tariff_loader as tl
from .config import UserConfig


# v0 curated electricity-only options (no gas pairing required).
# Used when the user has no gas in their config, OR via custom_combos when
# they want to compare cross-supplier split bundles.
CURATED_ELECTRICITY_ONLY = [
    ("pinergy_lifestyle_ev_drive_time_2026q2",
     "Pinergy EV Drive Time (5.99c @ 2-5am — electricity only)"),
    ("pinergy_lifestyle_smart_2026q2",
     "Pinergy Lifestyle Smart 3-band (electricity only)"),
    ("pinergy_lifestyle_family_time_2026q2",
     "Pinergy Lifestyle Family Time 7pm-12am (electricity only)"),
    ("pinergy_lifestyle_working_hours_2026q2",
     "Pinergy Lifestyle Working Hours 9am-5pm weekdays (electricity only)"),
]

# v0 curated dual-fuel switch options. (electricity_id, gas_id, label)
CURATED_DUAL_FUEL_COMBOS = [
    ("bg_ev_smart_dual_fuel_2026q2",         "bg_gas_15pc_with_ev_smart",
     "BG EV Smart + BG Gas-15%"),
    ("bg_smart_standard_dual_fuel_2026q2",   "bg_gas_21pc_with_nonev_smart_plans",
     "BG Smart Standard + BG Gas-21%"),
    ("bg_smart_all_day_dual_fuel_2026q2",    "bg_gas_21pc_with_nonev_smart_plans",
     "BG Smart All Day + BG Gas-21%"),
    ("energia_ev_smart_drive_plus_2026q2",   "energia_gas_10pc_with_ev_smart_drive",
     "Energia EV Smart Drive Plus + Gas 10%"),
    ("energia_smart_data_mcc12_2026q2",      "energia_gas_27pc_with_smart_data",
     "Energia Smart Data 27% + Energia Gas 27%"),
    ("flogas_ev_night_charge_2026q2",        "flogas_gas_28pc_with_smart",
     "Flogas EV Night Charge"),
    ("flogas_smart_standard_2026q2",         "flogas_gas_28pc_with_smart",
     "Flogas Smart Standard"),
    ("sse_smart_ev_max_2026q2",              "sse_gas_20pc",
     "SSE Smart EV Max + SSE Gas"),
    ("sse_smart_electricity_3band_2026q2",   "sse_gas_20pc",
     "SSE Smart Electricity 3-band + SSE Gas"),
    ("yuno_smart_dual_fuel_official_2026q2", "yuno_gas_official_quote",
     "Yuno Smart Dual Fuel (official quote)"),
    # Yuno NightSaver + estimated gas: pre-hike third-party rates, so apply
    # the announced Jul 2026 hike to make this a fair post-hike comparison.
    ("yuno_nightsaver_2026q2",               "yuno_gas_estimated",
     "Yuno NightSaver + Yuno Gas (post-hike est.)"),
    # Electric Ireland Home Dual+ family (current new-customer 8.5% off rates,
    # added 4 Jun 2026 from EI's price plans page).
    ("ei_home_dual_plus_sst_2026q2",         "ei_gas_dual_plus_8_5pc",
     "EI Home Dual+ SST (3-band ToU, 8.5% off, €120 welcome)"),
    ("ei_home_dual_plus_24hour_2026q2",      "ei_gas_dual_plus_8_5pc",
     "EI Home Dual+ 24hour (flat 8.5% off)"),
    ("ei_home_dual_plus_night_boost_2026q2", "ei_gas_dual_plus_8_5pc",
     "EI Home Dual+ Night Boost (9.62c @ 02-04am)"),
]


# Plans whose YAML rates are pre-hike — simulator should scale them up.
# Maps plan_id -> (fuel, pct). Sourced from hikes.yaml semantics.
HIKE_APPLICATIONS = {
    "yuno_nightsaver_2026q2": ("elec", 9.5),
    "yuno_gas_estimated":     ("gas", 11.0),
}


# When the user's current supplier has a known post-discount-expiry trap,
# map current electricity plan id -> (post_expiry_elec_id, post_expiry_gas_id).
# Used to build the DO-NOTHING comparison row.
DO_NOTHING_TARGETS = {
    "ei_home_electric_saver_28pc": (
        "ei_standard_24hr_post_jul_2026",
        "ei_gas_standard_post_jul_2026",
    ),
}


@dataclass
class Combo:
    label: str
    elec: dict
    gas: Optional[dict]
    is_baseline: bool = False
    is_do_nothing: bool = False


def _apply_hike_if_needed(plan_id: str, plan: dict, fuel: str) -> dict:
    if plan_id not in HIKE_APPLICATIONS:
        return plan
    expected_fuel, pct = HIKE_APPLICATIONS[plan_id]
    if expected_fuel != fuel:
        return plan
    if fuel == "elec":
        return tl.apply_electricity_hike(plan, pct)
    return tl.apply_gas_hike(plan, pct)


def build_combos(config: UserConfig, snapshot: tl.TariffSnapshot) -> list[Combo]:
    has_gas = config.gas is not None
    has_ev = config.electricity.ev.enabled

    combos: list[Combo] = []

    # 1) BASELINE: the user's current plan as-priced today.
    cur_e_id = config.electricity.current_plan.plan_id
    cur_e = snapshot.electricity[cur_e_id]
    cur_g = snapshot.gas[config.gas.current_plan.plan_id] if has_gas else None
    combos.append(Combo(
        label="BASELINE: your current plan (with current discount)",
        elec=cur_e,
        gas=cur_g,
        is_baseline=True,
    ))

    # 2) DO-NOTHING: same supplier post-discount-expiry / post-hike.
    if cur_e_id in DO_NOTHING_TARGETS:
        post_e_id, post_g_id = DO_NOTHING_TARGETS[cur_e_id]
        post_e = snapshot.electricity.get(post_e_id)
        post_g = snapshot.gas.get(post_g_id) if has_gas else None
        if post_e is not None:
            combos.append(Combo(
                label="DO-NOTHING: stay past discount expiry (post-hike standard)",
                elec=post_e,
                gas=post_g,
                is_do_nothing=True,
            ))

    # 3a) Electricity-only curated options (no gas needed).
    #     Only surfaced when the user has no gas; otherwise dual-fuel
    #     bundling premium makes these worse than a true bundle.
    if not has_gas:
        for e_id, label in CURATED_ELECTRICITY_ONLY:
            e = snapshot.electricity.get(e_id)
            if e is None or e["category"] == "discontinued":
                continue
            if e.get("requires_ev") and not has_ev:
                continue
            combos.append(Combo(label=label, elec=e, gas=None))

    # 3b) Dual-fuel curated options, filtered by user situation.
    for e_id, g_id, label in CURATED_DUAL_FUEL_COMBOS:
        e = snapshot.electricity.get(e_id)
        if e is None:
            continue
        if e["category"] == "discontinued":
            continue
        if e.get("requires_ev") and not has_ev:
            continue
        if e.get("requires_dual_fuel") and not has_gas:
            continue

        e = _apply_hike_if_needed(e_id, e, "elec")

        g = None
        if has_gas:
            g_raw = snapshot.gas.get(g_id)
            if g_raw is None:
                continue
            g = _apply_hike_if_needed(g_id, g_raw, "gas")
            combo_label = label
        else:
            # Electricity-only household — strip the "+ X Gas Y%" from the
            # curated label so the rank isn't misleading.
            combo_label = e["label"]

        combos.append(Combo(label=combo_label, elec=e, gas=g))

    # User-supplied custom combos (from config.custom_combos). Lets users
    # rank their own plans / pairings alongside the curated list.
    for entry in getattr(config, "custom_combos", []):
        e = snapshot.electricity.get(entry["electricity_id"])
        if e is None:
            raise ValueError(
                f"custom_combos: electricity_id {entry['electricity_id']!r} "
                f"not found (did you forget custom_electricity_plans?)"
            )
        g = None
        if has_gas and entry.get("gas_id"):
            g = snapshot.gas.get(entry["gas_id"])
            if g is None:
                raise ValueError(
                    f"custom_combos: gas_id {entry['gas_id']!r} not found "
                    f"(did you forget custom_gas_plans?)"
                )
        combos.append(Combo(label=entry.get("label", e["label"]), elec=e, gas=g))

    return combos
