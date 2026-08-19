// Plans that are published but not obtainable must never reach the ranking.
//
// Suppliers publish full tariff tables to satisfy CRU transparency rules while
// exposing only a subset in their sign-up flow. A cheaper number at rank 1
// reads as "switch to this"; if the user cannot switch to it, the whole table
// loses credibility. So obtainability is filtered at the source in App.tsx and
// everything downstream — headline answer, breakdowns, solar, negotiate — only
// ever sees plans a household can actually sign up for.

import { describe, expect, it } from "vitest";

import tariffsJson from "../public/tariffs.json";
import { toSnapshot, type RawTariffData } from "../src/data/tariffLoader";
import { comboAvailability, isComboObtainable } from "../src/domain/planner";
import type { Combo } from "../src/domain/planner";
import type { ElectricityPlan, GasPlan, PlanAvailability } from "../src/domain/types";

const snapshot = toSnapshot(tariffsJson as unknown as RawTariffData);

const elec = (availability: PlanAvailability) =>
  ({ availability }) as unknown as ElectricityPlan;
const gas = (availability: PlanAvailability) =>
  ({ availability }) as unknown as GasPlan;

const combo = (e: PlanAvailability, g: PlanAvailability | null): Combo =>
  ({
    id: "test",
    label: "test",
    elec: elec(e),
    gas: g === null ? null : gas(g),
  }) as Combo;

describe("combo obtainability", () => {
  it("accepts a combo whose halves are both self-serve", () => {
    expect(isComboObtainable(combo("self_serve", "self_serve"))).toBe(true);
    expect(isComboObtainable(combo("self_serve", null))).toBe(true);
  });

  it("rejects a combo if EITHER half is not self-serve", () => {
    expect(isComboObtainable(combo("unverified", "self_serve"))).toBe(false);
    expect(isComboObtainable(combo("self_serve", "unverified"))).toBe(false);
    expect(isComboObtainable(combo("agent_only", "self_serve"))).toBe(false);
    expect(isComboObtainable(combo("self_serve", "existing_customers_only"))).toBe(
      false,
    );
  });

  it("reports which half blocked it", () => {
    expect(comboAvailability(combo("agent_only", "self_serve"))).toBe("agent_only");
    expect(comboAvailability(combo("self_serve", "unverified"))).toBe("unverified");
    expect(comboAvailability(combo("self_serve", "self_serve"))).toBe("self_serve");
  });
});

describe("catalogue availability data", () => {
  const VALID: PlanAvailability[] = [
    "self_serve",
    "agent_only",
    "unverified",
    "existing_customers_only",
  ];

  it("gives every plan a valid availability", () => {
    for (const plan of Object.values(snapshot.electricity)) {
      expect(VALID).toContain(plan.availability);
    }
    for (const plan of Object.values(snapshot.gas)) {
      expect(VALID).toContain(plan.availability);
    }
  });

  it("keeps Yuno's Dual Fuel Smart Discount out of the obtainable set", () => {
    // Cheapest published dual fuel in the Aug 2026 catalogue, but absent from
    // Yuno's online sign-up flow. If that is ever confirmed to be reachable,
    // flip the YAML to self_serve and delete this test — do not weaken it.
    const plan = snapshot.electricity["yuno_dual_fuel_smart_discount_2026q3"];
    expect(plan).toBeDefined();
    expect(plan.availability).toBe("unverified");
  });
});
