import { describe, expect, it } from "vitest";

import { exportRevenue } from "../src/simulator";

describe("exportRevenue", () => {
  it("computes gross credit as kWh * rate / 100", () => {
    const r = exportRevenue(2000, 18.5, 400);
    expect(r.grossEur).toBeCloseTo(370, 9); // 2000 * 0.185
    expect(r.taxableExcessEur).toBe(0); // under the €400 cap
  });

  it("flags the taxable excess above the cap", () => {
    const r = exportRevenue(3000, 25.0, 400);
    expect(r.grossEur).toBeCloseTo(750, 9); // 3000 * 0.25
    expect(r.taxableExcessEur).toBeCloseTo(350, 9); // 750 - 400
  });

  it("uses the higher cap for a jointly-named bill", () => {
    const r = exportRevenue(3000, 25.0, 800);
    expect(r.grossEur).toBeCloseTo(750, 9);
    expect(r.taxableExcessEur).toBe(0); // 750 < 800
  });

  it("is zero with no export", () => {
    const r = exportRevenue(0, 25.0, 400);
    expect(r.grossEur).toBe(0);
    expect(r.taxableExcessEur).toBe(0);
  });

  it("preserves rate ordering: a higher rate earns more gross", () => {
    const pinergy = exportRevenue(2500, 25.0, 400).grossEur;
    const energia = exportRevenue(2500, 18.5, 400).grossEur;
    expect(pinergy).toBeGreaterThan(energia);
  });
});
