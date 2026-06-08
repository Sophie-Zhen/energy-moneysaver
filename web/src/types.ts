export type ConfidenceLevel = "FACT" | "BONKERS" | "THIRD_PARTY" | "GUESS";

export type RateBand = {
  hours: [number, number]; // [lo, hi) — same as Python convention
  rate_cpkwh: number;
  label: string;
};

export type PlanSource = {
  url: string;
  verified_on: string;
  confidence: ConfidenceLevel;
};

export type PlanCategory = "new_customer_offer" | "post_hike_standard" | "discontinued";

export type MeterType = "smart" | "day_night" | "standard_24hr";

export type ElectricityPlan = {
  id: string;
  supplier: string;
  label: string;
  category: PlanCategory;
  meter_type: MeterType;
  kind: "flat" | "bands";
  rate_cpkwh?: number;
  bands?: RateBand[];
  standing_eur_per_year: number;
  welcome_credit_eur: number;
  discount_pct: number;
  requires_dual_fuel: boolean;
  requires_ev: boolean;
  source: PlanSource;
  notes?: string | null;
};

export type GasPlan = {
  id: string;
  supplier: string;
  label: string;
  category: PlanCategory;
  rate_cpkwh: number; // inc VAT, ex carbon tax (added by simulator)
  standing_eur_per_year: number;
  welcome_credit_eur: number;
  discount_pct: number;
  requires_dual_fuel: boolean;
  requires_dual_fuel_with: string[] | null;
  source: PlanSource;
  notes?: string | null;
};

export type HourlySeries = number[]; // length 24
