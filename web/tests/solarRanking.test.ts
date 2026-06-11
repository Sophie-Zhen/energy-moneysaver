// Integration: solar export netting can reorder the ranking, using the real
// export rates from the built catalogue. Guards the end-to-end path App uses
// (same-supplier rate lookup + net = gross - credit), not just the unit math.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { annualElectricityOnlyCostEur, exportRevenue } from "../src/simulator";
import type { ElectricityPlan, ExportRate } from "../src/types";

const tariffs = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../public/tariffs.json", import.meta.url)),
    "utf8",
  ),
) as {
  electricity: ElectricityPlan[];
  export_rates: ExportRate[];
};

const byId = (id: string) => {
  const p = tariffs.electricity.find((e) => e.id === id);
  if (!p) throw new Error(`missing plan ${id}`);
  return p;
};
const rateFor = (supplier: string) =>
  tariffs.export_rates.find((r) => r.supplier === supplier)!.rate_cpkwh;

// Flat usage so the comparison is about export, not usage shape.
const flat = Array.from({ length: 24 }, () => 4000 / 24 / 365);

function netCost(plan: ElectricityPlan, exportKwh: number): number {
  const gross = annualElectricityOnlyCostEur({
    weekdayHourly: flat,
    weekendHourly: flat,
    elecPlan: plan,
    evAnnualKwh: 0,
  });
  const credit = exportRevenue(exportKwh, rateFor(plan.supplier), 400).grossEur;
  return gross - credit;
}

describe("solar export netting", () => {
  // Pinergy pays 25c vs Energia 18.5c. A large export should pull Pinergy's net
  // down relative to Energia by the export-rate gap × kWh.
  const pinergy = byId("pinergy_lifestyle_smart_2026q2");
  const energia = byId("energia_smart_data_mcc12_2026q2");
  const EXPORT = 3000;

  it("nets a larger credit for the higher-rate supplier", () => {
    const gap =
      netCost(energia, EXPORT) -
      netCost(pinergy, EXPORT) -
      (netCost(energia, 0) - netCost(pinergy, 0));
    // Pinergy gains (25 - 18.5)c × 3000 kWh = €195 more credit than Energia.
    expect(gap).toBeCloseTo(((25.0 - 18.5) / 100) * EXPORT, 6);
  });

  it("Energia is FACT-confirmed at 18.5c", () => {
    const r = tariffs.export_rates.find((x) => x.supplier === "Energia")!;
    expect(r.rate_cpkwh).toBe(18.5);
    expect(r.source.confidence).toBe("FACT");
  });
});
