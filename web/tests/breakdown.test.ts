// The cost breakdown must reconcile with the scalar totals it splits, for every
// real catalogue plan. This is the M3 verify step.

import { describe, expect, it } from "vitest";

import tariffsJson from "../public/tariffs.json";
import profilesJson from "../public/profiles.json";

import { toSnapshot, type RawTariffData } from "../src/tariffLoader";
import {
  DEFAULT_PROFILE_ID,
  scaleProfileToAnnualKwh,
  toProfiles,
  type RawProfilesData,
} from "../src/profiles";
import {
  annualElectricityOnlyCostEur,
  annualGasCostEur,
  electricityBreakdown,
  gasBreakdown,
} from "../src/simulator";

const snapshot = toSnapshot(tariffsJson as unknown as RawTariffData);
const profiles = toProfiles(profilesJson as unknown as RawProfilesData);
const profile = profiles[DEFAULT_PROFILE_ID];
const [wd, we] = scaleProfileToAnnualKwh(profile.weekday, profile.weekend, 3500);

describe("electricityBreakdown", () => {
  it("totalEur matches the scalar, and components sum to total, for every plan", () => {
    for (const plan of Object.values(snapshot.electricity)) {
      const input = {
        weekdayHourly: wd,
        weekendHourly: we,
        elecPlan: plan,
        evAnnualKwh: 0,
      };
      const b = electricityBreakdown(input);
      const scalar = annualElectricityOnlyCostEur(input);
      const sum =
        b.nightEur +
        b.dayEur +
        b.peakEur +
        b.standingEur +
        b.psoLevyEur -
        b.welcomeCreditEur;
      expect(b.totalEur).toBeCloseTo(scalar, 2); // within EUR 0.005
      expect(sum).toBeCloseTo(b.totalEur, 6);
    }
  });
});

describe("gasBreakdown", () => {
  it("totalEur matches the scalar, and components sum to total, for every plan", () => {
    for (const plan of Object.values(snapshot.gas)) {
      const b = gasBreakdown(plan, 12000);
      const scalar = annualGasCostEur(plan, 12000);
      const sum =
        b.unitsEur + b.carbonTaxEur + b.standingEur - b.welcomeCreditEur;
      expect(b.totalEur).toBeCloseTo(scalar, 6);
      expect(sum).toBeCloseTo(b.totalEur, 6);
    }
  });
});
