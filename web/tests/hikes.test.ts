import { describe, expect, it } from "vitest";

import {
  postHikeFraction,
  projectElectricity,
  projectGas,
} from "../src/domain/hikes";
import type { Hike } from "../src/data/tariffLoader";
import type { ElectricityPlan, GasPlan } from "../src/domain/types";

const EI_HIKE: Hike = {
  supplier: "Electric Ireland",
  effective_date: "2026-07-01",
  electricity_pct: 8.0,
  gas_pct: 7.7,
  confidence: "FACT",
  source: "ESB press release",
};
const HIKES = [EI_HIKE];

function elecPlan(over: Partial<ElectricityPlan> = {}): ElectricityPlan {
  return {
    id: "p",
    supplier: "Electric Ireland",
    label: "Test plan",
    category: "new_customer_offer",
    meter_type: "standard_24hr",
    kind: "flat",
    rate_cpkwh: 30,
    standing_eur_per_year: 200,
    welcome_credit_eur: 0,
    discount_pct: 0,
    requires_dual_fuel: false,
    requires_ev: false,
    source: { url: "x", verified_on: "2026-06-04", confidence: "FACT" },
    ...over,
  };
}

function gasPlan(over: Partial<GasPlan> = {}): GasPlan {
  return {
    id: "g",
    supplier: "Electric Ireland",
    label: "Test gas",
    category: "new_customer_offer",
    rate_cpkwh: 10,
    standing_eur_per_year: 100,
    welcome_credit_eur: 0,
    discount_pct: 0,
    requires_dual_fuel: false,
    requires_dual_fuel_with: null,
    source: { url: "x", verified_on: "2026-06-04", confidence: "FACT" },
    ...over,
  };
}

describe("postHikeFraction", () => {
  it("is 1 when the hike is already in effect at the window start", () => {
    expect(
      postHikeFraction(new Date("2026-08-01"), new Date("2026-07-01")),
    ).toBe(1);
  });

  it("is 0 when the hike lands after the window ends", () => {
    expect(
      postHikeFraction(new Date("2026-06-09"), new Date("2027-08-01")),
    ).toBe(0);
  });

  it("time-weights a mid-window hike", () => {
    // 2026-06-09 .. 2027-06-09 is 365 days; 2026-07-01 is 22 days in,
    // leaving 343 days post-hike.
    expect(
      postHikeFraction(new Date("2026-06-09"), new Date("2026-07-01")),
    ).toBeCloseTo(343 / 365, 5);
  });
});

describe("projectElectricity", () => {
  const from = new Date("2026-06-09");

  it("scales a flat rate by the time-weighted hike", () => {
    const { plan, hikePct } = projectElectricity(elecPlan(), HIKES, from);
    const expected = 30 * (1 + (8.0 * (343 / 365)) / 100);
    expect(plan.rate_cpkwh).toBeCloseTo(expected, 6);
    expect(hikePct).toBe(8.0); // announced pct surfaced for labelling
  });

  it("leaves standing charge untouched", () => {
    const { plan } = projectElectricity(elecPlan(), HIKES, from);
    expect(plan.standing_eur_per_year).toBe(200);
  });

  it("does not hike a post_hike_standard plan (already post-hike)", () => {
    const p = elecPlan({ category: "post_hike_standard" });
    const { plan, hikePct } = projectElectricity(p, HIKES, from);
    expect(plan.rate_cpkwh).toBe(30);
    expect(hikePct).toBeNull();
  });

  it("does not hike a plan whose rate was collected after the effective date", () => {
    const p = elecPlan({
      source: { url: "x", verified_on: "2026-07-15", confidence: "FACT" },
    });
    const { hikePct } = projectElectricity(p, HIKES, from);
    expect(hikePct).toBeNull();
  });

  it("does not hike a supplier with no announced increase", () => {
    const p = elecPlan({ supplier: "Energia" });
    const { hikePct } = projectElectricity(p, HIKES, from);
    expect(hikePct).toBeNull();
  });

  it("scales every band of a banded plan", () => {
    const p = elecPlan({
      kind: "bands",
      rate_cpkwh: undefined,
      bands: [
        { hours: [0, 8], rate_cpkwh: 20, label: "night" },
        { hours: [8, 24], rate_cpkwh: 40, label: "day" },
      ],
    });
    const { plan } = projectElectricity(p, HIKES, from);
    const f = 1 + (8.0 * (343 / 365)) / 100;
    expect(plan.bands![0].rate_cpkwh).toBeCloseTo(20 * f, 6);
    expect(plan.bands![1].rate_cpkwh).toBeCloseTo(40 * f, 6);
  });
});

describe("projectGas", () => {
  it("scales the gas rate by the time-weighted gas hike", () => {
    const from = new Date("2026-06-09");
    const { plan, hikePct } = projectGas(gasPlan(), HIKES, from);
    const expected = 10 * (1 + (7.7 * (343 / 365)) / 100);
    expect(plan.rate_cpkwh).toBeCloseTo(expected, 6);
    expect(hikePct).toBe(7.7);
  });
});
