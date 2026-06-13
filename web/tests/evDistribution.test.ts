// Regression guard for the App-layer wiring that decides each plan's EV
// distribution. The simulator itself was always correct; the bug was that
// App.tsx guarded the distribution on `kind === "bands"`, so flat-rate plans
// got an empty distribution and their EV kWh was never charged — making them
// artificially cheap. These tests exercise evDistributionFor (the shared helper
// both App call sites now use) so re-introducing that guard fails CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  annualElectricityOnlyCostEur,
  evDistributionFor,
} from "../src/domain/simulator";
import type { ElectricityPlan } from "../src/domain/types";

const tariffs = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../public/tariffs.json", import.meta.url)),
    "utf8",
  ),
) as { electricity: ElectricityPlan[] };

const byId = (id: string) => {
  const p = tariffs.electricity.find((e) => e.id === id);
  if (!p) throw new Error(`missing plan ${id}`);
  return p;
};

const flat = byId("ei_home_dual_plus_24hour_2026q2"); // kind: "flat"
const banded = byId("ei_home_dual_plus_sst_2026q2"); // kind: "bands"

// Flat usage so the test is about EV charging, not usage shape.
const usage = Array.from({ length: 24 }, () => 3500 / 24 / 365);

describe("evDistributionFor", () => {
  it("returns undefined when the household has no EV", () => {
    expect(evDistributionFor(flat, false)).toBeUndefined();
    expect(evDistributionFor(banded, false)).toBeUndefined();
  });

  it("gives flat plans a non-empty distribution (the regression)", () => {
    // The bug returned undefined here; a flat plan must still place its EV kWh
    // somewhere so it gets charged at the flat rate.
    expect(evDistributionFor(flat, true)).toEqual({ 0: 1.0 });
  });

  it("schedules a banded plan's EV into its cheapest band", () => {
    const dist = evDistributionFor(banded, true)!;
    expect(dist).toBeDefined();
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 6);
  });
});

describe("flat-rate plans charge for EV consumption", () => {
  it("a flat plan's annual cost rises by ~evKwh × flat rate when EV is added", () => {
    const EV = 2000;
    const noEv = annualElectricityOnlyCostEur({
      weekdayHourly: usage,
      weekendHourly: usage,
      elecPlan: flat,
      evAnnualKwh: 0,
      evDistribution: evDistributionFor(flat, false),
    });
    const withEv = annualElectricityOnlyCostEur({
      weekdayHourly: usage,
      weekendHourly: usage,
      elecPlan: flat,
      evAnnualKwh: EV,
      evDistribution: evDistributionFor(flat, true),
    });
    // Flat rate is the same every hour, so the whole EV load costs evKwh × rate.
    expect(withEv - noEv).toBeCloseTo((EV * flat.rate_cpkwh!) / 100, 6);
  });
});
