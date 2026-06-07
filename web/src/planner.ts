// Pick which (electricity, gas) combos to compare for a given user.
// TS port of src/planner.py, scoped to form-mode constraints.
//
// v0.2 keeps the curated lists from planner.py (single source of truth in
// catalogue YAML; ids referenced here must exist in tariffs/electricity.yaml
// or tariffs/gas.yaml).

import type { ElectricityPlan, GasPlan, MeterType } from "./types";
import type { TariffSnapshot } from "./tariffLoader";

export type Combo = {
  id: string;
  label: string;
  elec: ElectricityPlan;
  gas: GasPlan | null;
};

export type UserConstraints = {
  hasGas: boolean;
  hasEv: boolean;
  meterType: MeterType;
};

// Electricity-only curated options (no gas pairing required).
const CURATED_ELECTRICITY_ONLY: Array<[string, string]> = [
  [
    "pinergy_lifestyle_smart_2026q2",
    "Pinergy Lifestyle Smart 3-band",
  ],
  [
    "pinergy_lifestyle_family_time_2026q2",
    "Pinergy Family Time (7pm-midnight)",
  ],
  [
    "pinergy_lifestyle_working_hours_2026q2",
    "Pinergy Working from Home (9am-5pm weekday)",
  ],
];

// Curated dual-fuel switch options. Each tuple is (electricity_id, gas_id, label).
const CURATED_DUAL_FUEL: Array<[string, string, string]> = [
  [
    "bg_ev_smart_dual_fuel_2026q2",
    "bg_gas_15pc_with_ev_smart",
    "BG EV Smart + BG Gas-15%",
  ],
  [
    "bg_smart_standard_dual_fuel_2026q2",
    "bg_gas_21pc_with_nonev_smart_plans",
    "BG Smart Standard + BG Gas-21%",
  ],
  [
    "bg_smart_all_day_dual_fuel_2026q2",
    "bg_gas_21pc_with_nonev_smart_plans",
    "BG Smart All Day + BG Gas-21%",
  ],
  [
    "energia_ev_smart_drive_plus_2026q2",
    "energia_gas_10pc_with_ev_smart_drive",
    "Energia EV Smart Drive Plus + Gas 10%",
  ],
  [
    "energia_smart_data_mcc12_2026q2",
    "energia_gas_27pc_with_smart_data",
    "Energia Smart Data 27% + Gas 27%",
  ],
  [
    "energia_day_night_df_25pc_2026q2",
    "energia_gas_25pc_with_day_night_df",
    "Energia Day/Night Dual Fuel + Gas 25%",
  ],
  [
    "flogas_ev_night_charge_2026q2",
    "flogas_gas_28pc_with_smart",
    "Flogas EV Night Charge + Gas 28%",
  ],
  [
    "flogas_smart_standard_2026q2",
    "flogas_gas_28pc_with_smart",
    "Flogas Smart Standard + Gas 28%",
  ],
  [
    "sse_smart_ev_max_2026q2",
    "sse_gas_20pc",
    "SSE Smart EV Max + SSE Gas 20%",
  ],
  [
    "sse_smart_electricity_3band_2026q2",
    "sse_gas_20pc",
    "SSE Smart Electricity 3-band + SSE Gas 20%",
  ],
  [
    "yuno_smart_dual_fuel_official_2026q2",
    "yuno_gas_official_quote",
    "Yuno Smart Dual Fuel + Yuno Gas",
  ],
  [
    "ei_home_dual_plus_sst_2026q2",
    "ei_gas_dual_plus_8_5pc",
    "EI Home Dual+ SST (3-band ToU)",
  ],
  [
    "ei_home_dual_plus_24hour_2026q2",
    "ei_gas_dual_plus_8_5pc",
    "EI Home Dual+ 24hour (flat)",
  ],
  [
    "ei_home_dual_plus_night_boost_2026q2",
    "ei_gas_dual_plus_8_5pc",
    "EI Home Dual+ Night Boost (9.62c @ 2-4am)",
  ],
];

function passesUserConstraints(
  plan: ElectricityPlan,
  constraints: UserConstraints,
): boolean {
  if (plan.category === "discontinued") return false;
  if (plan.requires_ev && !constraints.hasEv) return false;
  if (plan.requires_dual_fuel && !constraints.hasGas) return false;
  if (plan.meter_type !== constraints.meterType) return false;
  return true;
}

export function buildCombos(
  snapshot: TariffSnapshot,
  constraints: UserConstraints,
): Combo[] {
  const out: Combo[] = [];

  if (!constraints.hasGas) {
    for (const [eid, label] of CURATED_ELECTRICITY_ONLY) {
      const e = snapshot.electricity[eid];
      if (!e || !passesUserConstraints(e, constraints)) continue;
      out.push({ id: `elec_only:${eid}`, label, elec: e, gas: null });
    }
  }

  for (const [eid, gid, label] of CURATED_DUAL_FUEL) {
    const e = snapshot.electricity[eid];
    if (!e || !passesUserConstraints(e, constraints)) continue;

    const g = constraints.hasGas ? snapshot.gas[gid] : null;
    if (constraints.hasGas && (!g || g.category === "discontinued")) continue;

    out.push({
      id: `dual:${eid}+${gid}`,
      label: constraints.hasGas ? label : e.label,
      elec: e,
      gas: g,
    });
  }

  return out;
}
