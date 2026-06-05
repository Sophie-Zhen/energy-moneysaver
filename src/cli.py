"""energy-moneysaver CLI entry point.

Usage:
    python -m src.cli --config my_config.yaml [--output report.html]
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from . import config as cfg_mod
from . import profiles
from . import simulator
from . import tariff_loader as tl
from .planner import Combo, build_combos


@dataclass
class ComboResult:
    combo: Combo
    cost_now_eur: float
    cost_shifted_eur: float       # = cost_now_eur if shifting isn't applicable


def _run_combo(
    combo: Combo,
    weekday_base,
    weekend_base,
    config: cfg_mod.UserConfig,
    ev_now_share: dict[int, float],
) -> ComboResult:
    has_ev = config.electricity.ev.enabled
    can_shift = has_ev and config.electricity.ev.can_schedule_charging
    ev_kwh = config.electricity.ev.annual_kwh if has_ev else 0.0

    gas_kwh = config.gas.annual_kwh if config.gas else 0.0

    def total(ev_distribution):
        if combo.gas is None:
            # Electricity-only household
            unit = simulator.annual_electricity_cost_eur(
                weekday_base, weekend_base, combo.elec,
                ev_annual_kwh=ev_kwh,
                ev_distribution=ev_distribution,
            )
            return (
                unit
                + combo.elec["standing_eur_per_year"]
                + simulator.ANNUAL_PSO_LEVY_INC_VAT
                - combo.elec["welcome_credit_eur"]
            )
        return simulator.annual_dual_fuel_cost_eur(
            weekday_base, weekend_base, combo.elec, combo.gas,
            gas_annual_kwh=gas_kwh,
            ev_annual_kwh=ev_kwh,
            ev_distribution=ev_distribution,
        )

    now = total(ev_now_share if has_ev else None)
    if can_shift:
        shifted_dist = (
            ev_now_share if combo.elec["kind"] == "flat"
            else simulator.ev_distribution_in_cheapest_band(combo.elec)
        )
        shifted = total(shifted_dist)
    else:
        shifted = now

    return ComboResult(combo=combo, cost_now_eur=now, cost_shifted_eur=shifted)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="energy-moneysaver")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=None,
                        help="Override output HTML path from config.")
    parser.add_argument("--text-only", action="store_true",
                        help="Skip HTML rendering, print results table.")
    args = parser.parse_args(argv)

    config = cfg_mod.load_config(args.config)
    snapshot = tl.load_all()
    if config.tariff_overrides or config.custom_electricity_plans or config.custom_gas_plans:
        snapshot = tl.apply_user_overrides(
            snapshot,
            overrides=config.tariff_overrides,
            custom_electricity=config.custom_electricity_plans,
            custom_gas=config.custom_gas_plans,
        )
        n_over = len(config.tariff_overrides)
        n_custom = (len(config.custom_electricity_plans)
                    + len(config.custom_gas_plans))
        print(f"Applied {n_over} tariff override(s) "
              f"and {n_custom} custom plan(s) from config.")

    errors = cfg_mod.validate(config, snapshot.electricity, snapshot.gas)
    if errors:
        for e in errors:
            print(f"config error: {e}", file=sys.stderr)
        return 1

    # Staleness check
    for fuel, last in snapshot.last_verified.items():
        level = tl.staleness_level(last)
        if level == "warn":
            print(f"WARNING: {fuel} tariff data last verified {last} "
                  f"(60-119 days old) — rates may be out of date.",
                  file=sys.stderr)
        elif level == "critical":
            print(f"CRITICAL: {fuel} tariff data last verified {last} "
                  f"(>=120 days old) — refresh before relying on results.",
                  file=sys.stderr)

    # Baseload pattern: HDF if provided, else default profile scaled.
    if config.electricity.hdf_csv_path:
        import pandas as pd
        ev_start = (pd.Timestamp(config.electricity.ev_start_date)
                    if config.electricity.ev_start_date else None)
        wd, we, stats = simulator.load_hdf_baseload_pattern(
            config.electricity.hdf_csv_path, ev_start_date=ev_start,
        )
        baseload_source = (
            f"your ESB Networks HDF "
            f"({stats['weekday_days']} weekdays + {stats['weekend_days']} weekends)"
        )
    else:
        wd, we, _ = profiles.load_profile()
        wd, we = profiles.scale_profile_to_annual_kwh(
            wd, we, config.electricity.annual_kwh,
        )
        baseload_source = (
            f"default profile (dublin_2person_mixed) "
            f"scaled to {config.electricity.annual_kwh:.0f} kWh/year"
        )

    # EV "now" distribution — for v0 always use the default sample pattern.
    # When HDF + post-EV period is present, we could derive this from data;
    # that's v0.1 work.
    _, _, ev_now_share = profiles.load_profile()

    # Build and run combos
    combos = build_combos(config, snapshot)
    results = [_run_combo(c, wd, we, config, ev_now_share) for c in combos]

    # Sort: switchable combos by cheapest shifted cost ascending, then
    # baseline, then do-nothing.
    switchable = [r for r in results
                  if not r.combo.is_baseline and not r.combo.is_do_nothing]
    switchable.sort(key=lambda r: r.cost_shifted_eur)
    baselines = [r for r in results if r.combo.is_baseline]
    do_nothings = [r for r in results if r.combo.is_do_nothing]
    ordered = switchable + baselines + do_nothings

    # Always print a text summary for terminal visibility.
    print()
    print(f"Baseload source: {baseload_source}")
    if config.electricity.ev.enabled:
        sched = "yes" if config.electricity.ev.can_schedule_charging else "no"
        print(f"EV: {config.electricity.ev.annual_kwh:.0f} kWh/year, "
              f"can schedule = {sched}")
    if config.gas:
        print(f"Gas: {config.gas.annual_kwh:.0f} kWh/year")
    print()
    print(f"{'Rank':<5} {'Combo':<52} {'Now €':>8} {'Shifted €':>11}")
    print("-" * 80)
    rank = 1
    for r in ordered:
        if r.combo.is_baseline:
            tag = "BL "
        elif r.combo.is_do_nothing:
            tag = "!  "
        else:
            tag = f"{rank:>2} "
            rank += 1
        print(f"{tag:<5} {r.combo.label[:51]:<52} "
              f"{r.cost_now_eur:>8.0f} {r.cost_shifted_eur:>11.0f}")

    if args.text_only:
        return 0

    # HTML rendering — separate module so terminal users can skip it.
    from .report_renderer import render_html
    out_path = args.output or config.output.html_path
    render_html(
        results=ordered,
        config=config,
        snapshot=snapshot,
        baseload_source=baseload_source,
        out_path=out_path,
    )
    print(f"\nWrote report: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
