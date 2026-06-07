// Hand-coded plans for M1 verification. In M2 these come from tariffs.json.

import type { ElectricityPlan, GasPlan } from "./types";

export const BG_SMART_STANDARD: ElectricityPlan = {
  id: "bg_smart_standard_dual_fuel_2026q2",
  supplier: "Bord Gáis",
  label: "Smart Standard Dual Fuel (22%/21% off, 3-band ToU, no EV band)",
  category: "new_customer_offer",
  meter_type: "smart",
  kind: "bands",
  bands: [
    { hours: [17, 19], rate_cpkwh: 42.2, label: "Peak" },
    { hours: [23, 24], rate_cpkwh: 25.59, label: "Night" },
    { hours: [0, 8], rate_cpkwh: 25.59, label: "Night" },
    { hours: [8, 17], rate_cpkwh: 34.67, label: "Day" },
    { hours: [19, 23], rate_cpkwh: 34.67, label: "Day" },
  ],
  standing_eur_per_year: 244.76,
  welcome_credit_eur: 0,
  discount_pct: 22,
  requires_dual_fuel: true,
  requires_ev: false,
  source: {
    url: "bordgaisenergy.ie/home/electricity-and-gas-plans (quote 2 Jun 2026)",
    verified_on: "2026-06-03",
    confidence: "FACT",
  },
};

export const BG_GAS_21PC: GasPlan = {
  id: "bg_gas_21pc_with_nonev_smart_plans",
  supplier: "Bord Gáis",
  label: "Gas (21% off, paired with Smart Standard / Smart All Day)",
  category: "new_customer_offer",
  rate_cpkwh: 8.83,
  standing_eur_per_year: 131.69,
  welcome_credit_eur: 0,
  discount_pct: 21,
  requires_dual_fuel: true,
  requires_dual_fuel_with: [
    "bg_smart_standard_dual_fuel_2026q2",
    "bg_smart_all_day_dual_fuel_2026q2",
  ],
  source: {
    url: "bordgaisenergy.ie/home/electricity-and-gas-plans (quote 2 Jun 2026)",
    verified_on: "2026-06-03",
    confidence: "FACT",
  },
};
