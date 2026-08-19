"""Tests for plan availability — whether a household can ACTUALLY get a plan.

Suppliers publish full tariff tables to satisfy CRU transparency rules while
exposing only a subset in their sign-up flow. Ranking a rate the user cannot
sign up for produces a recommendation they cannot act on, so those plans are
kept out of the ranking and reported separately.

Regression guarded here: Yuno's Dual Fuel Smart Discount is the cheapest
published dual fuel in the Aug 2026 catalogue but does not appear in Yuno's
online sign-up flow, and was briefly ranked #1.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import tariff_loader as tl
from src.constants import (
    AVAILABILITY_SELF_SERVE,
    AVAILABILITY_UNVERIFIED,
    AVAILABILITY_VALUES,
)
from src.planner import Combo


def test_every_plan_has_a_valid_availability():
    snapshot = tl.load_all()
    for plan in list(snapshot.electricity.values()) + list(snapshot.gas.values()):
        assert plan["availability"] in AVAILABILITY_VALUES, plan["id"]


def test_availability_defaults_to_self_serve():
    """Absent field means obtainable, so plans nobody has checked stay visible."""
    raw = {
        "id": "test_plan",
        "label": "Test",
        "supplier": "Test Co",
        "rates_inc_vat": {"kind": "flat", "rate_cpkwh": 30.0},
        "standing_eur_per_year": 250.0,
    }
    assert tl._convert_electricity_plan(raw)["availability"] == AVAILABILITY_SELF_SERVE


def test_unknown_availability_is_rejected():
    """A typo must fail loudly, not silently mark a plan obtainable."""
    raw = {
        "id": "test_plan",
        "label": "Test",
        "supplier": "Test Co",
        "availability": "selfserve",          # missing underscore
        "rates_inc_vat": {"kind": "flat", "rate_cpkwh": 30.0},
        "standing_eur_per_year": 250.0,
    }
    with pytest.raises(ValueError, match="unknown availability"):
        tl._convert_electricity_plan(raw)


def test_combo_is_only_as_obtainable_as_its_least_obtainable_half():
    obtainable = {"availability": AVAILABILITY_SELF_SERVE}
    blocked = {"availability": AVAILABILITY_UNVERIFIED}

    assert Combo("both ok", obtainable, obtainable).is_obtainable
    assert not Combo("elec blocked", blocked, obtainable).is_obtainable
    assert not Combo("gas blocked", obtainable, blocked).is_obtainable
    assert Combo("elec only", obtainable, None).is_obtainable


def test_baseline_and_do_nothing_are_always_obtainable():
    """The user is already on them, so the question does not arise."""
    blocked = {"availability": AVAILABILITY_UNVERIFIED}
    assert Combo("baseline", blocked, None, is_baseline=True).is_obtainable
    assert Combo("do nothing", blocked, None, is_do_nothing=True).is_obtainable


def test_yuno_smart_discount_is_flagged_unverified():
    """It is the cheapest published dual fuel but is not self-serve.

    If Yuno's sign-up flow is ever confirmed to reach it, flip the YAML to
    self_serve and delete this test — do not weaken it.
    """
    snapshot = tl.load_all()
    plan = snapshot.electricity["yuno_dual_fuel_smart_discount_2026q3"]
    assert plan["availability"] == AVAILABILITY_UNVERIFIED

    gas = snapshot.gas["yuno_gas_dual_fuel_discount"]
    combo = Combo("Yuno Dual Fuel Smart Discount", plan, gas)
    assert not combo.is_obtainable


def test_non_self_serve_plans_carry_a_reason_in_their_notes():
    """A flagged plan must explain itself, so the flag can be re-checked."""
    raw = yaml.safe_load(Path("tariffs/electricity.yaml").read_text())
    for plan in raw["plans"]:
        if plan.get("availability", AVAILABILITY_SELF_SERVE) == AVAILABILITY_SELF_SERVE:
            continue
        assert plan.get("notes"), f"{plan['id']}: flagged but has no notes"
        assert "AVAILABILITY" in plan["notes"].upper(), (
            f"{plan['id']}: notes do not explain the availability flag"
        )
