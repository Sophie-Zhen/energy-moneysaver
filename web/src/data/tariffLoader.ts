// Loads the normalized JSON produced by scripts/build-data.mjs into the
// runtime shape the simulator expects. Mirrors src/tariff_loader.py's
// load_all() but works off pre-normalized JSON (the YAML→JSON conversion
// happens at build time, not browser load time).

import type { ElectricityPlan, ExportRate, GasPlan } from "../domain/types";

export type Hike = {
  supplier: string;
  effective_date: string;
  electricity_pct: number;
  gas_pct: number;
  confidence: string;
  source: string;
  notes?: string;
};

export type LastVerified = {
  electricity: string;
  gas: string;
  hikes: string;
  electricity_export: string;
};

export type TariffSnapshot = {
  schema_version: number;
  last_verified: LastVerified;
  electricity: Record<string, ElectricityPlan>;
  gas: Record<string, GasPlan>;
  hikes: Hike[];
  exportRates: Record<string, ExportRate>; // keyed by supplier name
};

export type RawTariffData = {
  schema_version: number;
  last_verified: LastVerified;
  electricity: ElectricityPlan[];
  gas: GasPlan[];
  hikes: Hike[];
  export_rates: ExportRate[];
};

export function toSnapshot(raw: RawTariffData): TariffSnapshot {
  return {
    schema_version: raw.schema_version,
    last_verified: raw.last_verified,
    electricity: Object.fromEntries(raw.electricity.map((p) => [p.id, p])),
    gas: Object.fromEntries(raw.gas.map((p) => [p.id, p])),
    hikes: raw.hikes,
    exportRates: Object.fromEntries(
      (raw.export_rates ?? []).map((r) => [r.supplier, r]),
    ),
  };
}

export async function fetchTariffSnapshot(
  url = `${import.meta.env.BASE_URL}tariffs.json`,
): Promise<TariffSnapshot> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetch ${url} failed: ${resp.status} ${resp.statusText}`);
  }
  return toSnapshot((await resp.json()) as RawTariffData);
}
