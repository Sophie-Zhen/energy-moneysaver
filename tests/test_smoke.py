"""Smoke tests: catch obvious regressions without a real HDF.

These run in CI (.github/workflows/ci.yml). They check:
  1. All modules import cleanly.
  2. All shipped YAML parses with required fields present.
  3. The default residential load profile loads.
  4. End-to-end dual-fuel cost calc returns a sane EUR number.

For a deeper end-to-end check against known-good v3 reference numbers,
see examples/verify_against_v3.py (requires a real ESB Networks HDF export
and so is not runnable in CI).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `src` importable when pytest runs from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import tariff_loader as tl
from src.profiles import DEFAULT_PROFILE_ID, load_profile, scale_profile_to_annual_kwh
from src.simulator import annual_dual_fuel_cost_eur


def test_modules_import():
    from src import cli, config, constants, planner, report_renderer, simulator
    assert simulator.WEEKDAYS_PER_YEAR > 0
    assert constants.VAT_RESIDENTIAL == 1.09
    # Touch each module so a removed/renamed top-level symbol surfaces here.
    assert callable(cli.main)
    assert hasattr(config, "UserConfig")
    assert hasattr(planner, "build_combos")
    assert hasattr(report_renderer, "render_html")


def test_snapshot_loads_with_required_fields():
    snap = tl.load_all()
    assert snap.electricity, "no electricity plans loaded"
    assert snap.gas, "no gas plans loaded"

    elec_required = ("label", "supplier", "kind", "standing_eur_per_year", "source")
    for plan_id, plan in snap.electricity.items():
        for field in elec_required:
            assert field in plan, f"electricity plan {plan_id} missing {field}"
        if plan["kind"] == "flat":
            assert "rate_cpkwh" in plan, f"flat plan {plan_id} missing rate_cpkwh"
        elif plan["kind"] == "bands":
            assert plan["bands"], f"banded plan {plan_id} has empty bands"
        else:
            raise AssertionError(f"plan {plan_id} has unknown kind {plan['kind']!r}")

    gas_required = ("label", "supplier", "rate_cpkwh", "standing_eur_per_year", "source")
    for plan_id, plan in snap.gas.items():
        for field in gas_required:
            assert field in plan, f"gas plan {plan_id} missing {field}"


def test_default_profile_loads():
    weekday, weekend, _ = load_profile(DEFAULT_PROFILE_ID)
    assert len(weekday) == 24
    assert len(weekend) == 24
    assert weekday.sum() > 0
    assert weekend.sum() > 0


def test_end_to_end_dual_fuel_cost_is_sane():
    """Run the full cost pipeline against the default profile for one
    representative no-EV combo. Asserts the result lands in a sane EUR range,
    not an exact value (that's what verify_against_v3.py is for)."""
    snap = tl.load_all()
    weekday, weekend, _ = load_profile(DEFAULT_PROFILE_ID)
    weekday, weekend = scale_profile_to_annual_kwh(weekday, weekend, 3500)

    e_plan = snap.electricity["bg_smart_standard_dual_fuel_2026q2"]
    g_plan = snap.gas["bg_gas_21pc_with_nonev_smart_plans"]

    cost = annual_dual_fuel_cost_eur(
        weekday, weekend, e_plan, g_plan,
        gas_annual_kwh=12_000,
        ev_annual_kwh=0,
    )
    assert 1500 < cost < 6000, f"unexpected annual dual fuel cost: EUR {cost:.2f}"
