// Loads the normalized JSON produced by scripts/build-data.mjs into the
// runtime shape the simulator expects. Mirrors src/tariff_loader.py's
// load_all() but works off pre-normalized JSON (the YAML→JSON conversion
// happens at build time, not browser load time).

import type { ElectricityPlan, GasPlan } from "./types";

export type Hike = {
  supplier: string;
  effective_date: string;
  electricity_pct: number;
  gas_pct: number;
  confidence: string;
  source: string;
  notes?: string;
};

export type TariffSnapshot = {
  schema_version: number;
  last_verified: { electricity: string; gas: string; hikes: string };
  electricity: Record<string, ElectricityPlan>;
  gas: Record<string, GasPlan>;
  hikes: Hike[];
};

export type RawTariffData = {
  schema_version: number;
  last_verified: { electricity: string; gas: string; hikes: string };
  electricity: ElectricityPlan[];
  gas: GasPlan[];
  hikes: Hike[];
};

export function toSnapshot(raw: RawTariffData): TariffSnapshot {
  return {
    schema_version: raw.schema_version,
    last_verified: raw.last_verified,
    electricity: Object.fromEntries(raw.electricity.map((p) => [p.id, p])),
    gas: Object.fromEntries(raw.gas.map((p) => [p.id, p])),
    hikes: raw.hikes,
  };
}

export async function fetchTariffSnapshot(
  url = "/tariffs.json",
): Promise<TariffSnapshot> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetch ${url} failed: ${resp.status} ${resp.statusText}`);
  }
  return toSnapshot((await resp.json()) as RawTariffData);
}
