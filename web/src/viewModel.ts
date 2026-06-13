// View-model types shared between App and its presentational components.
// Built on top of the domain layer (planner Combo, simulator breakdowns), so
// this module imports from them — keep it out of ./types, which is a leaf that
// planner/simulator depend on (would create a cycle).

import type { Combo } from "./planner";
import type { ElectricityBreakdown, GasBreakdown } from "./simulator";

export type Mode = "form" | "hdf";

export type RankedCombo = {
  combo: Combo; // projected (post-hike) — drives the modelled cost and label
  orig: Combo; // original catalogue plans — the verified rates to check sources
  annualEur: number; // net of any solar export credit
  hiked: boolean;
  exportEur: number; // gross CEG credit netted into annualEur (0 if no solar)
  elecHikePct: number | null; // announced % applied in the projection, if any
  gasHikePct: number | null;
};

export type ComboBreakdown = {
  elec: ElectricityBreakdown;
  gas: GasBreakdown | null;
  exportEur: number; // gross solar export credit for this combo's supplier
};
