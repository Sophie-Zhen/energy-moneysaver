#!/usr/bin/env node
// Build step: read tariffs/*.yaml and tariffs/profiles/*.yaml, emit normalized
// JSON to public/. The Python loader's _convert_electricity_plan logic lives
// here so the catalogue YAML is the single source of truth for both the
// Python CLI and the web app.
//
// Run via `npm run build:data` or implicitly via pre{dev,build,test} hooks.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const tariffsDir = resolve(repoRoot, "tariffs");
const publicDir = resolve(__dirname, "..", "public");

// CORE_SCHEMA excludes the !!timestamp tag so YYYY-MM-DD stays a string.
// (PyYAML's default behavior keeps them as date objects which stringify
// to YYYY-MM-DD; js-yaml's default stringifies to full ISO timestamps.
// We want PyYAML's behavior for catalogue parity.)
function loadYaml(path) {
  return yaml.load(readFileSync(path, "utf8"), { schema: yaml.CORE_SCHEMA });
}

function normalizeElectricityPlan(raw) {
  const rates = raw.rates_inc_vat;
  if (!rates || !rates.kind) {
    throw new Error(`plan ${raw.id}: missing rates_inc_vat.kind`);
  }
  const out = {
    id: raw.id,
    supplier: raw.supplier,
    label: raw.label,
    category: raw.category ?? "new_customer_offer",
    meter_type: raw.meter_type,
    kind: rates.kind,
    standing_eur_per_year: raw.standing_eur_per_year,
    welcome_credit_eur: raw.welcome_credit_eur ?? 0,
    discount_pct: raw.discount_pct ?? 0,
    requires_dual_fuel: raw.requires_dual_fuel ?? false,
    requires_ev: raw.requires_ev ?? false,
    source: raw.source ?? {},
    notes: raw.notes ?? null,
  };
  if (rates.kind === "flat") {
    if (typeof rates.rate_cpkwh !== "number") {
      throw new Error(`flat plan ${raw.id}: missing numeric rate_cpkwh`);
    }
    out.rate_cpkwh = rates.rate_cpkwh;
  } else if (rates.kind === "bands") {
    if (!Array.isArray(rates.bands) || rates.bands.length === 0) {
      throw new Error(`banded plan ${raw.id}: empty bands list`);
    }
    out.bands = rates.bands.map((b) => ({
      hours: [b.hours[0], b.hours[1]],
      rate_cpkwh: b.rate_cpkwh,
      label: b.label ?? "",
    }));
  } else {
    throw new Error(`plan ${raw.id}: unknown rate kind ${rates.kind}`);
  }
  return out;
}

function normalizeExportRate(raw) {
  if (typeof raw.rate_cpkwh !== "number") {
    throw new Error(`export rate for ${raw.supplier}: missing numeric rate_cpkwh`);
  }
  return {
    supplier: raw.supplier,
    rate_cpkwh: raw.rate_cpkwh,
    source: raw.source ?? {},
    notes: raw.notes ?? null,
  };
}

function normalizeGasPlan(raw) {
  return {
    id: raw.id,
    supplier: raw.supplier,
    label: raw.label,
    category: raw.category ?? "new_customer_offer",
    rate_cpkwh: raw.rate_cpkwh_inc_vat,
    standing_eur_per_year: raw.standing_eur_per_year,
    welcome_credit_eur: raw.welcome_credit_eur ?? 0,
    discount_pct: raw.discount_pct ?? 0,
    requires_dual_fuel: raw.requires_dual_fuel ?? false,
    requires_dual_fuel_with: raw.requires_dual_fuel_with ?? null,
    source: raw.source ?? {},
    notes: raw.notes ?? null,
  };
}

const electricity = loadYaml(resolve(tariffsDir, "electricity.yaml"));
const gas = loadYaml(resolve(tariffsDir, "gas.yaml"));
const hikes = loadYaml(resolve(tariffsDir, "hikes.yaml"));
const electricityExport = loadYaml(
  resolve(tariffsDir, "electricity_export.yaml"),
);
const profile = loadYaml(
  resolve(tariffsDir, "profiles", "dublin_2person_mixed.yaml"),
);

const tariffs = {
  schema_version: 1,
  last_verified: {
    electricity: String(electricity.last_verified),
    gas: String(gas.last_verified),
    hikes: String(hikes.last_verified),
    electricity_export: String(electricityExport.last_verified),
  },
  electricity: electricity.plans.map(normalizeElectricityPlan),
  gas: gas.plans.map(normalizeGasPlan),
  hikes: hikes.hikes ?? [],
  export_rates: (electricityExport.rates ?? []).map(normalizeExportRate),
};

const toHourMap = (obj) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [String(k), Number(v)]),
  );

const profiles = {
  dublin_2person_mixed: {
    label: profile.label,
    source: profile.source,
    weekday: toHourMap(profile.weekday),
    weekend: toHourMap(profile.weekend),
  },
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  resolve(publicDir, "tariffs.json"),
  JSON.stringify(tariffs, null, 2) + "\n",
);
writeFileSync(
  resolve(publicDir, "profiles.json"),
  JSON.stringify(profiles, null, 2) + "\n",
);

console.log(
  `wrote ${tariffs.electricity.length} electricity plans, ` +
    `${tariffs.gas.length} gas plans, ${tariffs.hikes.length} hike(s), ` +
    `${tariffs.export_rates.length} export rate(s), ` +
    `${Object.keys(profiles).length} profile(s)`,
);
