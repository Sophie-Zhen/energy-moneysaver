"""Annual electricity + gas cost simulator.

Core math, supplier-agnostic. Given a baseload hourly pattern, an EV layer,
and a plan dict (from tariff_loader), returns the modelled annual cost.

CRU peak rule: Peak (17:00-19:00) applies Mon-Fri only. Weekend 17-19 falls
back to the Day rate. Implementation: weekday and weekend baseloads are
modelled separately; for the weekend pattern, hours 17-18 look up rate using
hour 16 as a proxy (which always falls in the Day band on every supported
plan).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .constants import (
    ANNUAL_PSO_LEVY_INC_VAT,
    DAY_RATE_PROBE_HOUR,
    GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT,
    PEAK_HOUR_END,
    PEAK_HOUR_START,
)

WEEKDAYS_PER_YEAR = 365 * 5 / 7
WEEKENDS_PER_YEAR = 365 * 2 / 7


# --------------------------- HDF parsing ---------------------------

def load_hdf_baseload_pattern(
    csv_path: Path,
    ev_start_date: pd.Timestamp | None = None,
) -> tuple[pd.Series, pd.Series, dict]:
    """Parse an ESB Networks half-hour HDF CSV into a (weekday, weekend)
    hourly baseload pattern.

    If ev_start_date is supplied, only readings BEFORE that date are used
    (useful when an EV was acquired mid-period — those days would otherwise
    inflate the baseload with EV charging).

    Returns (weekday_hourly, weekend_hourly, stats).
    """
    df = pd.read_csv(csv_path)
    df = df.rename(columns={
        "Read Value": "kwh",
        "Read Date and End Time": "end_time",
    })
    df = df[df["Read Type"] == "Active Import Interval (kWh)"].copy()
    df["end_time"] = pd.to_datetime(df["end_time"], format="%d-%m-%Y %H:%M")
    df["start_time"] = df["end_time"] - pd.Timedelta(minutes=30)
    df["hour"] = df["start_time"].dt.hour
    df["date"] = df["start_time"].dt.date
    df["is_weekend"] = df["start_time"].dt.dayofweek >= 5

    if ev_start_date is not None:
        df = df[df["start_time"] < ev_start_date]

    wd = df[~df["is_weekend"]]
    we = df[df["is_weekend"]]
    wd_days = wd["date"].nunique()
    we_days = we["date"].nunique()
    weekday_hourly = wd.groupby("hour")["kwh"].sum() / wd_days
    weekend_hourly = we.groupby("hour")["kwh"].sum() / we_days

    stats = {
        "weekday_days": wd_days,
        "weekend_days": we_days,
        "weekday_daily_avg_kwh": float(weekday_hourly.sum()),
        "weekend_daily_avg_kwh": float(weekend_hourly.sum()),
        "annualised_kwh": float(
            weekday_hourly.sum() * WEEKDAYS_PER_YEAR
            + weekend_hourly.sum() * WEEKENDS_PER_YEAR
        ),
    }
    return weekday_hourly, weekend_hourly, stats


# --------------------------- rate lookups ---------------------------

def rate_for_hour(plan: dict, hour: int) -> float:
    """c/kWh inc VAT for an hour under a (possibly banded) electricity plan."""
    if plan["kind"] == "flat":
        return plan["rate_cpkwh"]
    for (lo, hi), rate in plan["bands"]:
        if lo <= hour < hi:
            return rate
    raise ValueError(f"No band matches hour {hour} in plan {plan['label']!r}")


def rate_for_hour_aware(plan: dict, hour: int, is_weekend: bool) -> float:
    """Like rate_for_hour, but on weekends the Peak band falls back to Day."""
    if (
        is_weekend
        and PEAK_HOUR_START <= hour < PEAK_HOUR_END
        and plan["kind"] == "bands"
    ):
        return rate_for_hour(plan, DAY_RATE_PROBE_HOUR)
    return rate_for_hour(plan, hour)


# --------------------------- EV scheduling ---------------------------

def ev_distribution_in_cheapest_band(plan: dict) -> dict[int, float]:
    """All EV kWh distributed evenly across hours in the plan's cheapest
    band. Useful for the 'shifted' scenario (Zappi scheduled to off-peak)."""
    if plan["kind"] == "flat":
        return {0: 1.0}  # caller decides — flat means scheduling doesn't matter
    cheapest_rate = min(r for _, r in plan["bands"])
    hours: list[int] = []
    for (lo, hi), rate in plan["bands"]:
        if rate == cheapest_rate:
            hours.extend(range(lo, hi))
    if not hours:
        return {0: 1.0}
    share = 1.0 / len(hours)
    return {h: share for h in hours}


# --------------------------- annual cost ---------------------------

def annual_electricity_cost_eur(
    weekday_baseload: pd.Series,
    weekend_baseload: pd.Series,
    plan: dict,
    ev_annual_kwh: float = 0.0,
    ev_distribution: dict[int, float] | None = None,
) -> float:
    """Annual electricity unit-rate cost in EUR, EXCLUDING standing charge,
    welcome credit, and PSO levy (caller adds those).

    weekday/weekend baseload Series map hour -> kWh/day for that day type.
    ev_distribution maps hour -> share of ev_annual_kwh (sum to 1.0).
    """
    if ev_distribution is None or ev_annual_kwh == 0:
        ev_distribution = {}
    total_cents = 0.0
    for hour in range(24):
        wd_base = weekday_baseload.get(hour, 0) * WEEKDAYS_PER_YEAR
        we_base = weekend_baseload.get(hour, 0) * WEEKENDS_PER_YEAR
        ev_h = ev_annual_kwh * ev_distribution.get(hour, 0)
        ev_wd = ev_h * 5 / 7
        ev_we = ev_h * 2 / 7
        total_cents += (wd_base + ev_wd) * rate_for_hour_aware(plan, hour, False)
        total_cents += (we_base + ev_we) * rate_for_hour_aware(plan, hour, True)
    return total_cents / 100


def annual_gas_cost_eur(plan: dict, annual_kwh: float) -> float:
    """Full annual gas cost in EUR, including carbon tax, standing charge,
    and welcome credit deduction."""
    unit_eur = plan["rate_cpkwh"] / 100  # inc VAT, ex carbon tax
    return (
        unit_eur * annual_kwh
        + GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT * annual_kwh
        + plan["standing_eur_per_year"]
        - plan["welcome_credit_eur"]
    )


def annual_dual_fuel_cost_eur(
    weekday_baseload: pd.Series,
    weekend_baseload: pd.Series,
    elec_plan: dict,
    gas_plan: dict,
    gas_annual_kwh: float,
    ev_annual_kwh: float = 0.0,
    ev_distribution: dict[int, float] | None = None,
) -> float:
    """Sum of electricity (units + standing + PSO - welcome credit) and gas."""
    elec_units = annual_electricity_cost_eur(
        weekday_baseload, weekend_baseload, elec_plan, ev_annual_kwh, ev_distribution
    )
    elec_overhead = (
        elec_plan["standing_eur_per_year"]
        + ANNUAL_PSO_LEVY_INC_VAT
        - elec_plan["welcome_credit_eur"]
    )
    gas = annual_gas_cost_eur(gas_plan, gas_annual_kwh)
    return elec_units + elec_overhead + gas
