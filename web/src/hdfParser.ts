// Parse an ESB Networks HDF half-hour CSV export into (weekday, weekend)
// hourly baseload patterns. TS port of src/simulator.py:load_hdf_baseload_pattern.
//
// Privacy: the file is read into memory via the browser File API and never
// leaves the browser. No upload, no network call.

import Papa from "papaparse";

import { WEEKDAYS_PER_YEAR, WEEKENDS_PER_YEAR } from "./constants";
import type { HourlySeries } from "./types";

const ACTIVE_IMPORT = "Active Import Interval (kWh)";
const ACTIVE_EXPORT = "Active Export Interval (kWh)";
const REQUIRED_COLUMNS = [
  "Read Type",
  "Read Value",
  "Read Date and End Time",
] as const;

// ESB HDF rows are timestamped at the END of a 30-minute interval; subtract this
// to recover the interval's start time for weekday/weekend + EV-cutoff bucketing.
const HALF_HOUR_MS = 30 * 60 * 1000;

export type HdfStats = {
  weekdayDays: number;
  weekendDays: number;
  weekdayDailyAvgKwh: number;
  weekendDailyAvgKwh: number;
  annualisedKwh: number;
  firstReading: Date;
  lastReading: Date;
  rowsKept: number;
  rowsTotal: number;
  rowsAfterEvCutoff: number;
  exportAnnualKwh: number; // 0 if the HDF has no Active Export rows
};

export type HdfParseResult = {
  weekdayHourly: HourlySeries;
  weekendHourly: HourlySeries;
  stats: HdfStats;
};

// ESB Networks dates: "DD-MM-YYYY HH:MM" in Irish local time (naive).
// Constructed via `new Date(y, m-1, d, H, M)` so the browser interprets in
// local time; for any user not in IST, daylight-saving boundaries may produce
// off-by-one-hour rows. v0.2 ignores this — Irish users only.
export function parseEsbDate(s: string): Date {
  const trimmed = s.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx < 0) {
    throw new Error(`unparseable HDF datetime: ${s}`);
  }
  const datePart = trimmed.slice(0, spaceIdx);
  const timePart = trimmed.slice(spaceIdx + 1);
  const [dd, mm, yyyy] = datePart.split("-").map(Number);
  const [HH, MM] = timePart.split(":").map(Number);
  if (
    !Number.isInteger(dd) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(yyyy) ||
    !Number.isInteger(HH) ||
    !Number.isInteger(MM)
  ) {
    throw new Error(`unparseable HDF datetime: ${s}`);
  }
  return new Date(yyyy, mm - 1, dd, HH, MM);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

export function parseHdfCsv(
  csvText: string,
  evStartDate?: Date,
): HdfParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    const e = parsed.errors[0];
    throw new Error(`CSV parse error (row ${e.row}): ${e.message}`);
  }
  const rows = parsed.data;
  if (rows.length === 0) {
    throw new Error("HDF CSV is empty after header");
  }

  const sample = rows[0];
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in sample)) {
      throw new Error(
        `HDF CSV missing required column "${col}". ` +
          `Got: ${Object.keys(sample).join(", ")}`,
      );
    }
  }

  const weekdayHourSum = new Array<number>(24).fill(0);
  const weekendHourSum = new Array<number>(24).fill(0);
  const weekdayDates = new Set<string>();
  const weekendDates = new Set<string>();

  // Export (microgeneration) is accumulated independently: it is not subject
  // to the EV cutoff (generation is unrelated to EV charging) and the revenue
  // is rate-flat, so only the annual total matters — not the hourly shape.
  let weekdayExportSum = 0;
  let weekendExportSum = 0;
  const weekdayExportDates = new Set<string>();
  const weekendExportDates = new Set<string>();

  let firstReading: Date | null = null;
  let lastReading: Date | null = null;
  let rowsKept = 0;
  let rowsAfterEvCutoff = 0;

  for (const row of rows) {
    const readType = row["Read Type"];
    if (readType === ACTIVE_EXPORT) {
      const kwh = Number(row["Read Value"]);
      if (!Number.isFinite(kwh)) continue;
      const startTime = new Date(
        parseEsbDate(row["Read Date and End Time"]).getTime() - HALF_HOUR_MS,
      );
      if (isWeekend(startTime)) {
        weekendExportSum += kwh;
        weekendExportDates.add(dateKey(startTime));
      } else {
        weekdayExportSum += kwh;
        weekdayExportDates.add(dateKey(startTime));
      }
      continue;
    }
    if (readType !== ACTIVE_IMPORT) continue;

    const endTime = parseEsbDate(row["Read Date and End Time"]);
    const startTime = new Date(endTime.getTime() - HALF_HOUR_MS);

    if (evStartDate && startTime >= evStartDate) {
      rowsAfterEvCutoff++;
      continue;
    }

    const kwh = Number(row["Read Value"]);
    if (!Number.isFinite(kwh)) continue;

    if (!firstReading || startTime < firstReading) firstReading = startTime;
    if (!lastReading || startTime > lastReading) lastReading = startTime;

    const hour = startTime.getHours();
    if (isWeekend(startTime)) {
      weekendHourSum[hour] += kwh;
      weekendDates.add(dateKey(startTime));
    } else {
      weekdayHourSum[hour] += kwh;
      weekdayDates.add(dateKey(startTime));
    }
    rowsKept++;
  }

  const wdDays = weekdayDates.size;
  const weDays = weekendDates.size;
  if (wdDays === 0 && weDays === 0) {
    throw new Error(
      "No valid readings after filtering — check Read Type values " +
        "or the EV cutoff date.",
    );
  }

  const weekdayHourly: HourlySeries = weekdayHourSum.map((s) =>
    wdDays > 0 ? s / wdDays : 0,
  );
  const weekendHourly: HourlySeries = weekendHourSum.map((s) =>
    weDays > 0 ? s / weDays : 0,
  );

  const weekdayDailyAvgKwh = weekdayHourly.reduce((a, b) => a + b, 0);
  const weekendDailyAvgKwh = weekendHourly.reduce((a, b) => a + b, 0);
  const annualisedKwh =
    weekdayDailyAvgKwh * WEEKDAYS_PER_YEAR +
    weekendDailyAvgKwh * WEEKENDS_PER_YEAR;

  const wdExpDays = weekdayExportDates.size;
  const weExpDays = weekendExportDates.size;
  const exportAnnualKwh =
    (wdExpDays > 0 ? (weekdayExportSum / wdExpDays) * WEEKDAYS_PER_YEAR : 0) +
    (weExpDays > 0 ? (weekendExportSum / weExpDays) * WEEKENDS_PER_YEAR : 0);

  return {
    weekdayHourly,
    weekendHourly,
    stats: {
      weekdayDays: wdDays,
      weekendDays: weDays,
      weekdayDailyAvgKwh,
      weekendDailyAvgKwh,
      annualisedKwh,
      firstReading: firstReading!,
      lastReading: lastReading!,
      rowsKept,
      rowsTotal: rows.length,
      rowsAfterEvCutoff,
      exportAnnualKwh,
    },
  };
}
