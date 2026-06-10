// Annual electricity + gas cost simulator. Direct TS port of src/simulator.py.
// Verification: tests/simulator.test.ts asserts parity with the Python output.

import {
  ANNUAL_PSO_LEVY_INC_VAT,
  DAY_RATE_PROBE_HOUR,
  GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT,
  PEAK_HOUR_END,
  PEAK_HOUR_START,
  WEEKDAYS_PER_YEAR,
  WEEKENDS_PER_YEAR,
} from "./constants";
import type { ElectricityPlan, GasPlan, HourlySeries } from "./types";

export function rateForHour(plan: ElectricityPlan, hour: number): number {
  if (plan.kind === "flat") {
    if (plan.rate_cpkwh === undefined) {
      throw new Error(`flat plan ${plan.id} missing rate_cpkwh`);
    }
    return plan.rate_cpkwh;
  }
  if (!plan.bands) {
    throw new Error(`banded plan ${plan.id} missing bands`);
  }
  for (const band of plan.bands) {
    const [lo, hi] = band.hours;
    if (lo <= hour && hour < hi) return band.rate_cpkwh;
  }
  throw new Error(`No band matches hour ${hour} in plan ${plan.label}`);
}

export function rateForHourAware(
  plan: ElectricityPlan,
  hour: number,
  isWeekend: boolean,
): number {
  if (
    isWeekend &&
    PEAK_HOUR_START <= hour &&
    hour < PEAK_HOUR_END &&
    plan.kind === "bands"
  ) {
    return rateForHour(plan, DAY_RATE_PROBE_HOUR);
  }
  return rateForHour(plan, hour);
}

export function cheapestBandHour(plan: ElectricityPlan): number {
  if (plan.kind === "flat") return 0;
  if (!plan.bands) throw new Error(`banded plan ${plan.id} missing bands`);
  const cheapestRate = Math.min(...plan.bands.map((b) => b.rate_cpkwh));
  for (const band of plan.bands) {
    if (band.rate_cpkwh === cheapestRate) return band.hours[0];
  }
  throw new Error("unreachable");
}

export function cheapestBandEvDistribution(
  plan: ElectricityPlan,
): Record<number, number> {
  // All EV kWh distributed evenly across hours in the plan's cheapest band.
  // Mirrors src/simulator.py:ev_distribution_in_cheapest_band.
  if (plan.kind === "flat") return { 0: 1.0 };
  if (!plan.bands) throw new Error(`banded plan ${plan.id} missing bands`);
  const cheapestRate = Math.min(...plan.bands.map((b) => b.rate_cpkwh));
  const hours: number[] = [];
  for (const band of plan.bands) {
    if (band.rate_cpkwh === cheapestRate) {
      const [lo, hi] = band.hours;
      for (let h = lo; h < hi; h++) hours.push(h);
    }
  }
  if (hours.length === 0) return { 0: 1.0 };
  const share = 1.0 / hours.length;
  return Object.fromEntries(hours.map((h) => [h, share]));
}

export type DualFuelInput = {
  weekdayHourly: HourlySeries; // length 24, kWh/day at each hour
  weekendHourly: HourlySeries;
  elecPlan: ElectricityPlan;
  gasPlan: GasPlan;
  gasAnnualKwh: number;
  evAnnualKwh: number;
  evDistribution?: Record<number, number>; // hour -> share of EV kWh
};

export function annualElectricityCostEur(input: DualFuelInput): number {
  const {
    weekdayHourly,
    weekendHourly,
    elecPlan,
    evAnnualKwh,
    evDistribution = {},
  } = input;
  let totalCents = 0;
  for (let hour = 0; hour < 24; hour++) {
    const wdBase = (weekdayHourly[hour] ?? 0) * WEEKDAYS_PER_YEAR;
    const weBase = (weekendHourly[hour] ?? 0) * WEEKENDS_PER_YEAR;
    const evHour = evAnnualKwh * (evDistribution[hour] ?? 0);
    const evWd = (evHour * 5) / 7;
    const evWe = (evHour * 2) / 7;
    totalCents += (wdBase + evWd) * rateForHourAware(elecPlan, hour, false);
    totalCents += (weBase + evWe) * rateForHourAware(elecPlan, hour, true);
  }
  return totalCents / 100;
}

export function annualGasCostEur(plan: GasPlan, annualKwh: number): number {
  const unitEur = plan.rate_cpkwh / 100;
  return (
    unitEur * annualKwh +
    GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT * annualKwh +
    plan.standing_eur_per_year -
    plan.welcome_credit_eur
  );
}

export function annualDualFuelCostEur(input: DualFuelInput): number {
  const elecOnly = annualElectricityOnlyCostEur({
    weekdayHourly: input.weekdayHourly,
    weekendHourly: input.weekendHourly,
    elecPlan: input.elecPlan,
    evAnnualKwh: input.evAnnualKwh,
    evDistribution: input.evDistribution,
  });
  const gas = annualGasCostEur(input.gasPlan, input.gasAnnualKwh);
  return elecOnly + gas;
}

export type ElectricityOnlyInput = {
  weekdayHourly: HourlySeries;
  weekendHourly: HourlySeries;
  elecPlan: ElectricityPlan;
  evAnnualKwh: number;
  evDistribution?: Record<number, number>;
};

export function annualElectricityOnlyCostEur(
  input: ElectricityOnlyInput,
): number {
  // annualElectricityCostEur is the units-only piece; the same
  // overhead (standing + PSO - welcome credit) applies whether or not
  // there's a paired gas plan.
  const dummyDualFuelInput: DualFuelInput = {
    weekdayHourly: input.weekdayHourly,
    weekendHourly: input.weekendHourly,
    elecPlan: input.elecPlan,
    gasPlan: undefined as never,
    gasAnnualKwh: 0,
    evAnnualKwh: input.evAnnualKwh,
    evDistribution: input.evDistribution,
  };
  const units = annualElectricityCostEur(dummyDualFuelInput);
  const overhead =
    input.elecPlan.standing_eur_per_year +
    ANNUAL_PSO_LEVY_INC_VAT -
    input.elecPlan.welcome_credit_eur;
  return units + overhead;
}

// ----------------------------- cost breakdown -----------------------------
// A per-component split of the same totals the scalar functions return, so the
// UI can show "where the money goes / where the saving comes from". Units are
// bucketed into CRU-style time windows for a comparable peak/day/night split;
// the rate applied is still the plan's actual rate for that hour.

const NIGHT_START = 23;
const NIGHT_END = 8;

function classifyHour(hour: number, isWeekend: boolean): "peak" | "day" | "night" {
  if (hour >= NIGHT_START || hour < NIGHT_END) return "night";
  if (!isWeekend && PEAK_HOUR_START <= hour && hour < PEAK_HOUR_END) {
    return "peak";
  }
  return "day";
}

export type ElectricityBreakdown = {
  nightEur: number;
  dayEur: number;
  peakEur: number; // weekday 17:00-19:00 only
  standingEur: number;
  psoLevyEur: number;
  welcomeCreditEur: number; // positive; subtracted from the total
  totalEur: number;
};

export function electricityBreakdown(
  input: ElectricityOnlyInput,
): ElectricityBreakdown {
  const {
    weekdayHourly,
    weekendHourly,
    elecPlan,
    evAnnualKwh,
    evDistribution = {},
  } = input;
  let peakC = 0;
  let dayC = 0;
  let nightC = 0;
  for (let hour = 0; hour < 24; hour++) {
    const wdBase = (weekdayHourly[hour] ?? 0) * WEEKDAYS_PER_YEAR;
    const weBase = (weekendHourly[hour] ?? 0) * WEEKENDS_PER_YEAR;
    const evHour = evAnnualKwh * (evDistribution[hour] ?? 0);
    const evWd = (evHour * 5) / 7;
    const evWe = (evHour * 2) / 7;
    const wdC = (wdBase + evWd) * rateForHourAware(elecPlan, hour, false);
    const weC = (weBase + evWe) * rateForHourAware(elecPlan, hour, true);
    const wdBucket = classifyHour(hour, false);
    if (wdBucket === "peak") peakC += wdC;
    else if (wdBucket === "night") nightC += wdC;
    else dayC += wdC;
    // Weekend 17-19 is never peak (matches rateForHourAware).
    if (classifyHour(hour, true) === "night") nightC += weC;
    else dayC += weC;
  }
  const standingEur = elecPlan.standing_eur_per_year;
  const psoLevyEur = ANNUAL_PSO_LEVY_INC_VAT;
  const welcomeCreditEur = elecPlan.welcome_credit_eur;
  const totalEur =
    (peakC + dayC + nightC) / 100 + standingEur + psoLevyEur - welcomeCreditEur;
  return {
    nightEur: nightC / 100,
    dayEur: dayC / 100,
    peakEur: peakC / 100,
    standingEur,
    psoLevyEur,
    welcomeCreditEur,
    totalEur,
  };
}

export type GasBreakdown = {
  unitsEur: number;
  carbonTaxEur: number;
  standingEur: number;
  welcomeCreditEur: number; // positive; subtracted from the total
  totalEur: number;
};

export type NegotiateTarget = {
  multiplier: number; // unit-rate multiplier m to hit the target cost
  reductionPct: number; // (1 - m) * 100: how much lower than current rates
  feasible: boolean; // false if even free units can't match (m <= 0)
};

// What unit-rate cut would make staying on the current plan as cheap as a
// target cost? Only unit rates move; standing charge, PSO, carbon tax and
// welcome credit are held fixed:  unitsCost * m + fixedCost = target.
export function negotiateTarget(
  unitsCost: number,
  fixedCost: number,
  target: number,
): NegotiateTarget {
  if (unitsCost <= 0) return { multiplier: 1, reductionPct: 0, feasible: false };
  const m = (target - fixedCost) / unitsCost;
  return { multiplier: m, reductionPct: (1 - m) * 100, feasible: m > 0 };
}

export type UsageBandSplit = {
  nightKwh: number;
  dayKwh: number;
  peakKwh: number; // weekday 17:00-19:00 only
};

// Where the household's electricity is used, by CRU-style time window. Used as
// evidence for "why this plan wins" — it's a fact about the user's usage,
// independent of any plan. EV charging is excluded (modelled separately; its
// schedule would otherwise be self-fulfilling).
export function usageKwhByBand(input: {
  weekdayHourly: HourlySeries;
  weekendHourly: HourlySeries;
}): UsageBandSplit {
  let night = 0;
  let day = 0;
  let peak = 0;
  for (let hour = 0; hour < 24; hour++) {
    const wd = (input.weekdayHourly[hour] ?? 0) * WEEKDAYS_PER_YEAR;
    const we = (input.weekendHourly[hour] ?? 0) * WEEKENDS_PER_YEAR;
    const wdBucket = classifyHour(hour, false);
    if (wdBucket === "peak") peak += wd;
    else if (wdBucket === "night") night += wd;
    else day += wd;
    if (classifyHour(hour, true) === "night") night += we;
    else day += we;
  }
  return { nightKwh: night, dayKwh: day, peakKwh: peak };
}

export function gasBreakdown(plan: GasPlan, annualKwh: number): GasBreakdown {
  const unitsEur = (plan.rate_cpkwh / 100) * annualKwh;
  const carbonTaxEur = GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT * annualKwh;
  return {
    unitsEur,
    carbonTaxEur,
    standingEur: plan.standing_eur_per_year,
    welcomeCreditEur: plan.welcome_credit_eur,
    totalEur:
      unitsEur +
      carbonTaxEur +
      plan.standing_eur_per_year -
      plan.welcome_credit_eur,
  };
}
