// Parity test: TS simulator must match Python output within EUR 0.01.
//
// The expected value 2861.199016 was computed by the Python simulator with
// the same inputs: default residential profile (dublin_2person_mixed)
// scaled to 3,500 kWh/year electricity, BG Smart Standard Dual Fuel +
// BG Gas (the bg_gas_21pc_* id), 12,000 kWh gas, no EV.
//
// It rose from 2735.962796 in the 17 Aug 2026 rate refresh because Bord Gáis
// cut its new-customer dual-fuel discount from 22%/21% to 17%/17% — the rates
// changed, not the engines. If this assertion fails after a tariff edit, take
// the replacement number from the freshly generated
// tests/fixtures/parity.json (scenario form_3500_elec_12000_gas_no_ev, this
// exact plan pair) so it stays a genuine Python-vs-TS check rather than a
// copy of whatever the TS side happened to produce.
//
// This test now exercises the full data-load path:
//   tariffs/*.yaml ─(build:data)→ public/tariffs.json ─(toSnapshot)→ plans
//   tariffs/profiles/*.yaml ─(build:data)→ public/profiles.json ─(toProfiles)→ profile
//
// `pretest` regenerates the JSON before vitest runs, so YAML edits show up
// here automatically.

import { describe, expect, it } from "vitest";

import tariffsJson from "../public/tariffs.json";
import profilesJson from "../public/profiles.json";

import { annualDualFuelCostEur } from "../src/domain/simulator";
import { toSnapshot, type RawTariffData } from "../src/data/tariffLoader";
import {
  DEFAULT_PROFILE_ID,
  scaleProfileToAnnualKwh,
  toProfiles,
  type RawProfilesData,
} from "../src/data/profiles";

const snapshot = toSnapshot(tariffsJson as unknown as RawTariffData);
const profiles = toProfiles(profilesJson as unknown as RawProfilesData);

describe("annualDualFuelCostEur — parity with Python", () => {
  it("matches Python for BG Smart Standard + Gas 21% combo", () => {
    const profile = profiles[DEFAULT_PROFILE_ID];
    expect(profile).toBeDefined();

    const [weekday, weekend] = scaleProfileToAnnualKwh(
      profile.weekday,
      profile.weekend,
      3_500,
    );

    const elecPlan = snapshot.electricity["bg_smart_standard_dual_fuel_2026q2"];
    const gasPlan = snapshot.gas["bg_gas_21pc_with_nonev_smart_plans"];
    expect(elecPlan).toBeDefined();
    expect(gasPlan).toBeDefined();

    const cost = annualDualFuelCostEur({
      weekdayHourly: weekday,
      weekendHourly: weekend,
      elecPlan,
      gasPlan,
      gasAnnualKwh: 12_000,
      evAnnualKwh: 0,
    });

    const PYTHON_EXPECTED = 2861.199016;
    expect(cost).toBeCloseTo(PYTHON_EXPECTED, 2);
  });
});
