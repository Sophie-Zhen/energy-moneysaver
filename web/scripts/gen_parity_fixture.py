"""Generate the TS parity fixture.

For every plausible (electricity, gas) combo in the catalogue, compute the
Python simulator's annual cost under a fixed form-mode scenario, plus a
small set of EV scenarios. Write the results to
`web/tests/fixtures/parity.json` so the Vitest port can assert it matches
the TS simulator within EUR 0.01.

Run from the repo root:
    conda activate energy-moneysaver
    python web/scripts/gen_parity_fixture.py
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

from src import tariff_loader as tl
from src.profiles import DEFAULT_PROFILE_ID, load_profile, scale_profile_to_annual_kwh
from src.simulator import (
    annual_dual_fuel_cost_eur,
    ev_distribution_in_cheapest_band,
)

OUT_PATH = REPO / "web" / "tests" / "fixtures" / "parity.json"

# A representative current EV charging distribution (matches verify_against_v3
# but only the broad shape — used here against the default load profile, not
# against a real HDF).
EV_HOURS_CURRENT_RAW = {
    17: 0.046, 18: 0.041, 19: 0.055, 20: 0.077, 21: 0.094,
    22: 0.096, 23: 0.080, 0: 0.039, 1: 0.042, 2: 0.012,
    3: 0.012, 4: 0.006,
}
_s = sum(EV_HOURS_CURRENT_RAW.values())
EV_HOURS_CURRENT = {h: w / _s for h, w in EV_HOURS_CURRENT_RAW.items()}

SCENARIOS = {
    "form_3500_elec_12000_gas_no_ev": {
        "label": "3,500 kWh elec, 12,000 kWh gas, no EV",
        "annual_elec_kwh": 3500,
        "gas_annual_kwh": 12000,
        "ev_annual_kwh": 0,
        "ev_mode": "none",
    },
    "form_3500_elec_12000_gas_2000_ev_current": {
        "label": "3,500 kWh elec + 2,000 kWh EV (current charging habits)",
        "annual_elec_kwh": 3500,
        "gas_annual_kwh": 12000,
        "ev_annual_kwh": 2000,
        "ev_mode": "current",
    },
    "form_3500_elec_12000_gas_2000_ev_shifted": {
        "label": "3,500 kWh elec + 2,000 kWh EV (scheduled to cheapest band)",
        "annual_elec_kwh": 3500,
        "gas_annual_kwh": 12000,
        "ev_annual_kwh": 2000,
        "ev_mode": "shifted",
    },
}


def is_active(plan: dict) -> bool:
    return plan.get("category") != "discontinued"


def combo_is_valid(e_plan: dict, g_plan: dict) -> bool:
    """Mirror planner.py's compatibility rules. An electricity plan paired
    with a gas plan must:
      - both be active
      - gas plan must be standalone, OR the elec plan must appear in the
        gas plan's requires_dual_fuel_with list
    """
    if not is_active(e_plan) or not is_active(g_plan):
        return False
    if g_plan.get("requires_dual_fuel"):
        with_list = g_plan.get("requires_dual_fuel_with") or []
        if e_plan["id"] not in with_list:
            return False
    return True


def main() -> int:
    snap = tl.load_all()
    wd, we, _ = load_profile(DEFAULT_PROFILE_ID)

    results = []
    for scenario_id, scenario in SCENARIOS.items():
        wd_scaled, we_scaled = scale_profile_to_annual_kwh(
            wd, we, scenario["annual_elec_kwh"]
        )
        for e_id, e_plan in snap.electricity.items():
            if not is_active(e_plan):
                continue
            for g_id, g_plan in snap.gas.items():
                if not combo_is_valid(e_plan, g_plan):
                    continue

                if scenario["ev_mode"] == "none":
                    ev_dist = None
                elif scenario["ev_mode"] == "current":
                    ev_dist = EV_HOURS_CURRENT
                elif scenario["ev_mode"] == "shifted":
                    ev_dist = (
                        EV_HOURS_CURRENT if e_plan["kind"] == "flat"
                        else ev_distribution_in_cheapest_band(e_plan)
                    )
                else:
                    raise ValueError(scenario["ev_mode"])

                cost = annual_dual_fuel_cost_eur(
                    wd_scaled, we_scaled, e_plan, g_plan,
                    gas_annual_kwh=scenario["gas_annual_kwh"],
                    ev_annual_kwh=scenario["ev_annual_kwh"],
                    ev_distribution=ev_dist,
                )
                results.append({
                    "scenario_id": scenario_id,
                    "electricity_id": e_id,
                    "gas_id": g_id,
                    "expected_eur": round(cost, 6),
                })

    fixture = {
        "generated_with": "web/scripts/gen_parity_fixture.py",
        "scenarios": SCENARIOS,
        "ev_hours_current": EV_HOURS_CURRENT,
        "results": results,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {len(results)} parity rows across {len(SCENARIOS)} scenarios "
          f"to {OUT_PATH.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
