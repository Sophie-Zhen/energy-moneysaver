// Parity test: TS simulator must match Python output within EUR 0.01.
//
// The expected value 2735.962796 was computed by the Python simulator at
// commit 005f201 with the same inputs (default profile scaled to 3500 kWh,
// BG Smart Standard + BG Gas 21%, 12000 kWh gas, no EV). If this drifts,
// either the TS port broke or the Python source changed — investigate
// before "fixing" the number here.

import { describe, expect, it } from "vitest";

import { annualDualFuelCostEur } from "../src/simulator";
import { BG_SMART_STANDARD, BG_GAS_21PC } from "../src/fixturePlans";
import {
  DEFAULT_WEEKDAY_HOURLY_3500KWH,
  DEFAULT_WEEKEND_HOURLY_3500KWH,
} from "../src/fixtureProfile";

describe("annualDualFuelCostEur — parity with Python", () => {
  it("matches Python output for BG Smart Standard + BG Gas 21% combo", () => {
    const cost = annualDualFuelCostEur({
      weekdayHourly: DEFAULT_WEEKDAY_HOURLY_3500KWH,
      weekendHourly: DEFAULT_WEEKEND_HOURLY_3500KWH,
      elecPlan: BG_SMART_STANDARD,
      gasPlan: BG_GAS_21PC,
      gasAnnualKwh: 12_000,
      evAnnualKwh: 0,
    });

    const PYTHON_EXPECTED = 2735.962796;
    expect(cost).toBeCloseTo(PYTHON_EXPECTED, 2);
  });
});
