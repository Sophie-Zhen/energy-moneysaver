import { describe, expect, it } from "vitest";

import { negotiateTarget } from "../src/domain/simulator";

describe("negotiateTarget", () => {
  // current plan: units 1000, fixed 400 -> total 1400.
  const units = 1000;
  const fixed = 400;

  it("needs no cut to match its own cost (m = 1)", () => {
    const t = negotiateTarget(units, fixed, 1400);
    expect(t.multiplier).toBeCloseTo(1, 9);
    expect(t.reductionPct).toBeCloseTo(0, 9);
    expect(t.feasible).toBe(true);
  });

  it("solves the unit-rate cut to hit a lower target", () => {
    // target 1200 -> units*m = 800 -> m = 0.8 -> 20% off.
    const t = negotiateTarget(units, fixed, 1200);
    expect(t.multiplier).toBeCloseTo(0.8, 9);
    expect(t.reductionPct).toBeCloseTo(20, 9);
    expect(t.feasible).toBe(true);
  });

  it("flags infeasible when fixed charges alone exceed the target", () => {
    // target 300 < fixed 400 -> m negative -> no unit cut can match.
    const t = negotiateTarget(units, fixed, 300);
    expect(t.feasible).toBe(false);
    expect(t.multiplier).toBeLessThan(0);
  });

  it("reports a negative reduction when current already beats the target", () => {
    // target 1500 > total 1400 -> m > 1 -> already cheaper than target.
    const t = negotiateTarget(units, fixed, 1500);
    expect(t.multiplier).toBeGreaterThan(1);
    expect(t.reductionPct).toBeLessThan(0);
  });

  it("is infeasible with no unit cost to move", () => {
    expect(negotiateTarget(0, 400, 300).feasible).toBe(false);
  });
});
