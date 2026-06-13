// Loads the residential load profile JSON produced by build-data.mjs and
// provides the same scale-to-annual-kWh utility as src/profiles.py.

import { WEEKDAYS_PER_YEAR, WEEKENDS_PER_YEAR } from "../domain/constants";
import type { HourlySeries } from "../domain/types";

export type Profile = {
  label: string;
  source: string;
  weekday: HourlySeries; // length 24
  weekend: HourlySeries;
};

export type RawProfilesData = Record<
  string,
  {
    label: string;
    source: string;
    weekday: Record<string, number>;
    weekend: Record<string, number>;
  }
>;

export const DEFAULT_PROFILE_ID = "dublin_2person_mixed";

function hourMapToArray(obj: Record<string, number>): HourlySeries {
  const arr: HourlySeries = new Array(24).fill(0);
  for (const [k, v] of Object.entries(obj)) {
    arr[Number(k)] = v;
  }
  return arr;
}

export function toProfiles(raw: RawProfilesData): Record<string, Profile> {
  const out: Record<string, Profile> = {};
  for (const [id, p] of Object.entries(raw)) {
    out[id] = {
      label: p.label,
      source: p.source,
      weekday: hourMapToArray(p.weekday),
      weekend: hourMapToArray(p.weekend),
    };
  }
  return out;
}

export async function fetchProfiles(
  url = `${import.meta.env.BASE_URL}profiles.json`,
): Promise<Record<string, Profile>> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetch ${url} failed: ${resp.status} ${resp.statusText}`);
  }
  return toProfiles((await resp.json()) as RawProfilesData);
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export function scaleProfileToAnnualKwh(
  weekday: HourlySeries,
  weekend: HourlySeries,
  targetAnnualKwh: number,
): [HourlySeries, HourlySeries] {
  const currentAnnual =
    sum(weekday) * WEEKDAYS_PER_YEAR + sum(weekend) * WEEKENDS_PER_YEAR;
  if (currentAnnual === 0) return [weekday, weekend];
  const factor = targetAnnualKwh / currentAnnual;
  return [weekday.map((v) => v * factor), weekend.map((v) => v * factor)];
}
