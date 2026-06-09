// Forward projection: apply announced supplier price hikes to plans whose
// rates were collected before the hike's effective date, so the ranking
// reflects the next 12 months rather than today's spot rate.
//
// Irish residential plans are predominantly variable-rate: a "X% off" deal is
// a discount off the standard variable rate, and a supplier's announced
// increase passes through to existing discounted customers (the discount %
// stays, applied to a now-higher base). Fixed-price products have largely been
// pulled from the market. So an announced hike does raise these plans' rates.
//
// Mirrors src/tariff_loader.py apply_electricity_hike / apply_gas_hike: scale
// UNIT rates only (not standing charge, not welcome credit). Only announced
// hikes are applied (FACT/PRESS in hikes.yaml); unannounced suppliers are left
// at their current rate — we do not speculate about future increases.

import type { ElectricityPlan, GasPlan } from "./types";
import type { Hike } from "./tariffLoader";

export function applyElectricityHike(
  plan: ElectricityPlan,
  pct: number,
): ElectricityPlan {
  const scale = 1 + pct / 100;
  return {
    ...plan,
    rate_cpkwh:
      plan.rate_cpkwh != null ? plan.rate_cpkwh * scale : plan.rate_cpkwh,
    bands: plan.bands
      ? plan.bands.map((b) => ({ ...b, rate_cpkwh: b.rate_cpkwh * scale }))
      : plan.bands,
    label: `${plan.label} [post +${pct.toFixed(1)}% hike]`,
  };
}

export function applyGasHike(plan: GasPlan, pct: number): GasPlan {
  return {
    ...plan,
    rate_cpkwh: plan.rate_cpkwh * (1 + pct / 100),
    label: `${plan.label} [post +${pct.toFixed(1)}% hike]`,
  };
}

// The announced hike for this supplier whose effective date is after the plan's
// verified_on (rates are pre-hike). Plans already at post-hike rates
// (category "post_hike_standard") are never re-hiked.
function applicableHike(
  supplier: string,
  verifiedOn: string,
  category: string,
  hikes: Hike[],
): Hike | null {
  if (category === "post_hike_standard") return null;
  for (const h of hikes) {
    if (h.supplier === supplier && h.effective_date > verifiedOn) return h;
  }
  return null;
}

// Share of a `windowDays` window starting at `from` that falls on/after the
// hike's effective date. Time-weights the hike: the part of the year before the
// hike is at the old rate, only the part after pays the increase. 1 if the hike
// is already in effect at `from`, 0 if it lands after the window ends.
//
// `from` defaults to today — i.e. "if you switch now". When a switch/contract
// date input lands, pass that instead for a per-user window. Uniform over time
// (not weighted by seasonal usage) — a transparent approximation.
export function postHikeFraction(
  from: Date,
  effective: Date,
  windowDays = 365,
): number {
  const ms = windowDays * 86_400_000;
  const end = from.getTime() + ms;
  if (effective.getTime() <= from.getTime()) return 1;
  if (effective.getTime() >= end) return 0;
  return (end - effective.getTime()) / ms;
}

export type Projection<T> = { plan: T; hikePct: number | null };

export function projectElectricity(
  plan: ElectricityPlan,
  hikes: Hike[],
  from: Date,
): Projection<ElectricityPlan> {
  const h = applicableHike(
    plan.supplier,
    plan.source.verified_on,
    plan.category,
    hikes,
  );
  if (!h || h.electricity_pct === 0) return { plan, hikePct: null };
  const eff = h.electricity_pct * postHikeFraction(from, new Date(h.effective_date));
  if (eff <= 0) return { plan, hikePct: null };
  return { plan: applyElectricityHike(plan, eff), hikePct: h.electricity_pct };
}

export function projectGas(
  plan: GasPlan,
  hikes: Hike[],
  from: Date,
): Projection<GasPlan> {
  const h = applicableHike(
    plan.supplier,
    plan.source.verified_on,
    plan.category,
    hikes,
  );
  if (!h || h.gas_pct === 0) return { plan, hikePct: null };
  const eff = h.gas_pct * postHikeFraction(from, new Date(h.effective_date));
  if (eff <= 0) return { plan, hikePct: null };
  return { plan: applyGasHike(plan, eff), hikePct: h.gas_pct };
}
