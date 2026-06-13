// HDF CSV parser tests. Uses small synthetic CSVs (not Sophie's real HDF)
// so the unit suite can run offline and in CI without leaking any data.

import { describe, expect, it } from "vitest";

import { parseEsbDate, parseHdfCsv } from "../src/data/hdfParser";

const HEADER = "MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time";
const PREFIX = "10001234567,000000000099999999";

// Build a half-hour reading row.
function row(kwh: number, dt: string, type = "Active Import Interval (kWh)") {
  return `${PREFIX},${kwh.toFixed(4)},${type},${dt}`;
}

describe("parseEsbDate", () => {
  it("parses DD-MM-YYYY HH:MM in local time", () => {
    const d = parseEsbDate("26-05-2026 03:00");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // 0-indexed: May
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(3);
    expect(d.getMinutes()).toBe(0);
  });

  it("throws on malformed input", () => {
    expect(() => parseEsbDate("not-a-date")).toThrow();
  });
});

describe("parseHdfCsv", () => {
  it("derives a flat hourly pattern from uniform readings", () => {
    // 4 days (Mon 26 May 2025 .. Thu 29 May 2025 are weekdays),
    // each with 48 half-hour readings of 0.5 kWh = 24 kWh/day, evenly across
    // 24 hours → 1.0 kWh per hour bucket per day.
    const lines: string[] = [HEADER];
    const baseDays = ["26-05-2025", "27-05-2025", "28-05-2025", "29-05-2025"];
    for (const day of baseDays) {
      for (let hh = 0; hh < 24; hh++) {
        for (const mm of ["00", "30"]) {
          // Reading end-time is at start-of-next-half-hour, so e.g. 00:30
          // covers 00:00–00:29. We log end time at 00:30 and 01:00.
          const endHH = mm === "30" ? hh : (hh + 1) % 24;
          const endMM = mm === "30" ? "30" : "00";
          const dayPart =
            endHH === 0 && mm === "00"
              ? // Roll to next day for the 24:00 → 00:00 wrap
                baseDays[baseDays.indexOf(day) + 1] ?? day
              : day;
          lines.push(
            row(0.5, `${dayPart} ${String(endHH).padStart(2, "0")}:${endMM}`),
          );
        }
      }
    }
    const csv = lines.join("\n");
    const result = parseHdfCsv(csv);

    expect(result.stats.weekdayDays).toBeGreaterThanOrEqual(3);
    // Each hour bucket should sum to ~1.0 kWh/day
    for (let h = 0; h < 24; h++) {
      expect(result.weekdayHourly[h]).toBeCloseTo(1.0, 1);
    }
  });

  it("respects ev cutoff date", () => {
    // 1 weekday before cutoff, 1 weekday after — should keep only the first.
    const lines = [
      HEADER,
      row(0.5, "26-05-2025 12:30"), // Mon, kept
      row(0.5, "27-05-2025 12:30"), // Tue, after cutoff
    ];
    const result = parseHdfCsv(lines.join("\n"), new Date(2025, 4, 27, 0, 0));
    expect(result.stats.weekdayDays).toBe(1);
    expect(result.stats.rowsAfterEvCutoff).toBe(1);
  });

  it("filters out non-Active-Import rows", () => {
    const lines = [
      HEADER,
      row(0.5, "26-05-2025 12:30"),
      row(0.5, "26-05-2025 13:00", "Active Export Interval (kWh)"),
    ];
    const result = parseHdfCsv(lines.join("\n"));
    expect(result.stats.rowsKept).toBe(1);
  });

  it("reports zero export when the HDF has no Active Export rows", () => {
    const lines = [HEADER, row(0.5, "26-05-2025 12:30")];
    expect(parseHdfCsv(lines.join("\n")).stats.exportAnnualKwh).toBe(0);
  });

  it("annualises Active Export rows independently of import and EV cutoff", () => {
    // One weekday (Mon 26 May 2025) with two 0.4 kWh export half-hours = 0.8
    // kWh on that day → annualised over weekdays only. The EV cutoff would drop
    // the import row but must NOT touch export.
    const EXPORT = "Active Export Interval (kWh)";
    const lines = [
      HEADER,
      row(0.5, "26-05-2025 12:30"), // import, keeps the day valid
      row(0.4, "26-05-2025 12:30", EXPORT),
      row(0.4, "26-05-2025 13:00", EXPORT),
    ];
    const result = parseHdfCsv(lines.join("\n"), new Date(2025, 4, 27, 0, 0));
    expect(result.stats.exportAnnualKwh).toBeCloseTo(0.8 * (365 * 5) / 7, 6);
  });

  it("throws when required columns are missing", () => {
    const bad = "MPRN,Read Value\n123,0.5";
    expect(() => parseHdfCsv(bad)).toThrow(/missing required column/);
  });

  it("throws when no readings remain after filtering", () => {
    const lines = [HEADER, row(0.5, "26-05-2025 12:30", "Other (kWh)")];
    expect(() => parseHdfCsv(lines.join("\n"))).toThrow(/No valid readings/);
  });
});
