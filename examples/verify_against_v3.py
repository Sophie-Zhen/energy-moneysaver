"""End-to-end verification that the YAML migration reproduces a known-good
reference report.

Runs the same set of dual-fuel combos analysed in the v3 reference report
and prints each combo's annual cost in two scenarios:

  Now     - EV charging at the user's current habits
  Shifted - EV charging scheduled to the plan's cheapest band

Then diffs each against the reference baseline. PASS = within EUR 1.

The reference dataset is a single Dublin household with smart meter, 1 EV
acquired mid-period, and gas central heating. To run:

    VERIFY_HDF_PATH=/path/to/your/HDF_calckWh_*.csv \\
        python examples/verify_against_v3.py

If VERIFY_HDF_PATH is not set, the script falls back to a default location
that won't exist on a fresh clone — copy this file and edit the constants
near the top to point at your own data.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd

# Allow `python examples/verify_against_v3.py` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import tariff_loader as tl
from src.simulator import (
    annual_dual_fuel_cost_eur,
    cheapest_band_hour,
    ev_distribution_in_cheapest_band,
    load_hdf_baseload_pattern,
)

# --------------------------- household constants ---------------------------

HDF_PATH = Path(os.environ.get(
    "VERIFY_HDF_PATH",
    "examples/sample_hdf_NOT_PRESENT.csv",
))
TESLA_START = pd.Timestamp("2026-03-09")  # EV charging started; HDF pre-this is pure baseload
ANNUAL_GAS_KWH = 17_285
ANNUAL_EV_KWH = 2_022

# Current EV charging hour distribution (from HDF post-Tesla period).
# Maps hour -> share of EV kWh actually going in that hour today.
EV_HOURS_CURRENT_RAW = {
    17: 0.046, 18: 0.041, 19: 0.055, 20: 0.077, 21: 0.094,
    22: 0.096, 23: 0.080, 0:  0.039, 1:  0.042, 2:  0.012,
    3:  0.012, 4:  0.006,
}
_ev_sum = sum(EV_HOURS_CURRENT_RAW.values())
EV_HOURS_CURRENT = {h: w / _ev_sum for h, w in EV_HOURS_CURRENT_RAW.items()}

# Yuno hike percentages from hikes.yaml — applied here to the OLD-ESTIMATE
# Yuno plans whose rates are pre-hike (selectra third-party). The "official
# quote" Yuno plans came from a verified customer quote and are treated as-is.
YUNO_ELEC_HIKE_PCT = 9.5
YUNO_GAS_HIKE_PCT = 11.0

# Combos to run: (electricity_id, gas_id, label, expected_now, expected_shifted)
COMBOS = [
    ("ei_home_electric_saver_28pc",         "ei_gas_saver_28pc",
     "BASELINE: current EI (28% off)",                                  3448, 3448),
    ("ei_standard_24hr_post_jul_2026",      "ei_gas_standard_post_jul_2026",
     "DO-NOTHING: EI standard post-hike",                               4955, 4955),
    ("bg_ev_smart_dual_fuel_2026q2",        "bg_gas_15pc_with_ev_smart",
     "BG EV Smart + BG Gas-15%",                                        4267, 3781),
    ("bg_smart_standard_dual_fuel_2026q2",  "bg_gas_21pc_with_nonev_smart_plans",
     "BG Smart Standard + BG Gas-21%",                                  4017, 3876),
    ("bg_smart_all_day_dual_fuel_2026q2",   "bg_gas_21pc_with_nonev_smart_plans",
     "BG Smart All Day + BG Gas-21% (flat)",                            4019, 4019),
    ("energia_ev_smart_drive_plus_2026q2",  "energia_gas_10pc_with_ev_smart_drive",
     "Energia EV Smart Drive Plus + Gas 10%",                           4382, 3902),
    ("energia_smart_data_mcc12_2026q2",     "energia_gas_27pc_with_smart_data",
     "Energia Smart Data 27% + Energia Gas 27%",                        3606, 3407),
    ("flogas_ev_night_charge_2026q2",       "flogas_gas_28pc_with_smart",
     "Flogas EV Night Charge (2-5am @ 7.66c)",                          3710, 3310),
    ("flogas_smart_standard_2026q2",        "flogas_gas_28pc_with_smart",
     "Flogas Smart Standard (no EV band)",                              3601, 3480),
    # SSE numbers corrected 4 Jun 2026 after PDF tariff sheet verification:
    #   - Gas rate was 9.919c (selectra ex-VAT mislabeled inc-VAT) → 9.10c
    #   - SSE Smart Electricity 3-band had NO €100 welcome credit (25% off
    #     variant; only 15% + €170 variant has a credit).
    ("sse_smart_ev_max_2026q2",             "sse_gas_20pc",
     "SSE Smart EV Max + SSE Gas",                                      4137, 3797),
    ("sse_smart_electricity_3band_2026q2",  "sse_gas_20pc",
     "SSE Smart Electricity 3-band + SSE Gas",                          3919, 3750),
    # Yuno NightSaver + Yuno Gas estimated: pre-hike third-party rates, so
    # apply hike to reproduce v3 (which modelled post-hike scenario).
    ("yuno_nightsaver_2026q2",              "yuno_gas_estimated",
     "Yuno NightSaver + Yuno Gas (post-hike, estimate)",                4187, 3983),
    # Yuno official quote: rates current as of 1 Jun 2026, no hike applied.
    ("yuno_smart_dual_fuel_official_2026q2", "yuno_gas_official_quote",
     "Yuno Smart Dual Fuel + Gas (official quote)",                     3742, 3560),
]

# Plans where the YAML rates are pre-hike and need scaling to reproduce v3.
APPLY_ELEC_HIKE = {"yuno_nightsaver_2026q2"}
APPLY_GAS_HIKE = {"yuno_gas_estimated"}

TOLERANCE_EUR = 1.0


def main() -> int:
    snapshot = tl.load_all()
    weekday_base, weekend_base, stats = load_hdf_baseload_pattern(
        HDF_PATH, ev_start_date=TESLA_START
    )

    print(f"Pre-Tesla baseload : {stats['weekday_days']} weekdays, "
          f"{stats['weekend_days']} weekend days, "
          f"weekday avg = {stats['weekday_daily_avg_kwh']:.2f} kWh/day, "
          f"weekend avg = {stats['weekend_daily_avg_kwh']:.2f} kWh/day, "
          f"annualised = {stats['annualised_kwh']:.0f} kWh/year")
    print()
    print(f"{'Combo':<54} "
          f"{'Now':>6} {'(v3)':>6} {'Δ':>5}   "
          f"{'Shifted':>8} {'(v3)':>6} {'Δ':>5}   Status")
    print("-" * 110)

    all_ok = True
    for e_id, g_id, label, exp_now, exp_shifted in COMBOS:
        e_plan = snapshot.electricity[e_id]
        g_plan = snapshot.gas[g_id]
        if e_id in APPLY_ELEC_HIKE:
            e_plan = tl.apply_electricity_hike(e_plan, YUNO_ELEC_HIKE_PCT)
        if g_id in APPLY_GAS_HIKE:
            g_plan = tl.apply_gas_hike(g_plan, YUNO_GAS_HIKE_PCT)

        now_total = annual_dual_fuel_cost_eur(
            weekday_base, weekend_base, e_plan, g_plan,
            gas_annual_kwh=ANNUAL_GAS_KWH,
            ev_annual_kwh=ANNUAL_EV_KWH,
            ev_distribution=EV_HOURS_CURRENT,
        )
        shifted_total = annual_dual_fuel_cost_eur(
            weekday_base, weekend_base, e_plan, g_plan,
            gas_annual_kwh=ANNUAL_GAS_KWH,
            ev_annual_kwh=ANNUAL_EV_KWH,
            ev_distribution=(
                EV_HOURS_CURRENT if e_plan["kind"] == "flat"
                else ev_distribution_in_cheapest_band(e_plan)
            ),
        )

        d_now = now_total - exp_now
        d_shift = shifted_total - exp_shifted
        ok = abs(d_now) < TOLERANCE_EUR and abs(d_shift) < TOLERANCE_EUR
        all_ok = all_ok and ok
        status = "PASS" if ok else "FAIL"
        print(f"{label[:53]:<54} "
              f"{now_total:6.0f} {exp_now:>6} {d_now:>+5.1f}   "
              f"{shifted_total:>8.0f} {exp_shifted:>6} {d_shift:>+5.1f}   {status}")

    print()
    print("OVERALL:", "PASS — YAML migration reproduces v3." if all_ok
          else "FAIL — drift > €1, investigate.")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
