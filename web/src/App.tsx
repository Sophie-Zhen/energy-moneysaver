import { useEffect, useMemo, useState } from "react";

import { fetchTariffSnapshot, type TariffSnapshot } from "./tariffLoader";
import {
  fetchProfiles,
  scaleProfileToAnnualKwh,
  DEFAULT_PROFILE_ID,
  type Profile,
} from "./profiles";
import {
  annualDualFuelCostEur,
  annualElectricityOnlyCostEur,
  cheapestBandEvDistribution,
} from "./simulator";
import { buildCombos, type Combo, type UserConstraints } from "./planner";
import { parseHdfCsv, type HdfParseResult } from "./hdfParser";
import type { HourlySeries, MeterType } from "./types";

type Mode = "form" | "hdf";
type RankedCombo = { combo: Combo; annualEur: number };

export function App() {
  const [snapshot, setSnapshot] = useState<TariffSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("form");

  const [annualElecKwh, setAnnualElecKwh] = useState(3500);
  const [hasGas, setHasGas] = useState(true);
  const [annualGasKwh, setAnnualGasKwh] = useState(12_000);
  const [hasEv, setHasEv] = useState(false);
  const [annualEvKwh, setAnnualEvKwh] = useState(2_000);
  const [meterType, setMeterType] = useState<MeterType>("smart");

  const [hdfFileName, setHdfFileName] = useState<string | null>(null);
  const [hdfText, setHdfText] = useState<string | null>(null);
  const [evStartDate, setEvStartDate] = useState<string>(""); // YYYY-MM-DD

  useEffect(() => {
    Promise.all([fetchTariffSnapshot(), fetchProfiles()])
      .then(([snap, profiles]) => {
        setSnapshot(snap);
        setProfile(profiles[DEFAULT_PROFILE_ID] ?? null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const hdfResult = useMemo<HdfParseResult | { error: string } | null>(() => {
    if (mode !== "hdf" || !hdfText) return null;
    try {
      const cutoff =
        hasEv && evStartDate ? new Date(`${evStartDate}T00:00:00`) : undefined;
      return parseHdfCsv(hdfText, cutoff);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [mode, hdfText, hasEv, evStartDate]);

  const series = useMemo<{
    weekday: HourlySeries;
    weekend: HourlySeries;
    derivedAnnualKwh: number;
  } | null>(() => {
    if (mode === "hdf") {
      if (!hdfResult || "error" in hdfResult) return null;
      return {
        weekday: hdfResult.weekdayHourly,
        weekend: hdfResult.weekendHourly,
        derivedAnnualKwh: hdfResult.stats.annualisedKwh,
      };
    }
    if (!profile) return null;
    const [weekday, weekend] = scaleProfileToAnnualKwh(
      profile.weekday,
      profile.weekend,
      annualElecKwh,
    );
    return { weekday, weekend, derivedAnnualKwh: annualElecKwh };
  }, [mode, hdfResult, profile, annualElecKwh]);

  const ranking: RankedCombo[] | null = useMemo(() => {
    if (!snapshot || !series) return null;
    const constraints: UserConstraints = { hasGas, hasEv, meterType };
    const combos = buildCombos(snapshot, constraints);

    return combos
      .map((combo) => {
        const evDist =
          hasEv && combo.elec.kind === "bands"
            ? cheapestBandEvDistribution(combo.elec)
            : undefined;
        const effectiveEvKwh = hasEv ? annualEvKwh : 0;

        const annualEur = combo.gas
          ? annualDualFuelCostEur({
              weekdayHourly: series.weekday,
              weekendHourly: series.weekend,
              elecPlan: combo.elec,
              gasPlan: combo.gas,
              gasAnnualKwh: annualGasKwh,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            })
          : annualElectricityOnlyCostEur({
              weekdayHourly: series.weekday,
              weekendHourly: series.weekend,
              elecPlan: combo.elec,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            });
        return { combo, annualEur };
      })
      .sort((a, b) => a.annualEur - b.annualEur);
  }, [snapshot, series, hasGas, annualGasKwh, hasEv, annualEvKwh, meterType]);

  const handleFile = (file: File | null) => {
    if (!file) {
      setHdfFileName(null);
      setHdfText(null);
      return;
    }
    setHdfFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setHdfText(String(e.target?.result ?? ""));
    reader.onerror = () => setHdfText(null);
    reader.readAsText(file);
  };

  return (
    <main>
      <h1>energy-moneysaver</h1>
      <p className="muted">
        Compare Irish electricity {hasGas ? "& gas " : ""}plans. Pick a mode:
        a form-only quick estimate, or upload your ESB Networks half-hour
        export for higher accuracy. Files never leave your browser.
      </p>

      {loadError && (
        <div className="result" role="alert">
          Could not load catalogue: {loadError}
        </div>
      )}

      <fieldset className="mode-toggle">
        <legend className="muted">Input mode</legend>
        <label>
          <input
            type="radio"
            name="mode"
            value="form"
            checked={mode === "form"}
            onChange={() => setMode("form")}
          />
          {" "}Form mode (annual kWh + default profile)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="hdf"
            checked={mode === "hdf"}
            onChange={() => setMode("hdf")}
          />
          {" "}Upload HDF (ESB Networks half-hour CSV)
        </label>
      </fieldset>

      <section className="form-grid">
        {mode === "form" && (
          <label className="field">
            Annual electricity kWh
            <input
              type="number"
              min={500}
              max={20000}
              step={100}
              value={annualElecKwh}
              onChange={(e) => setAnnualElecKwh(Number(e.target.value))}
            />
          </label>
        )}

        {mode === "hdf" && (
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            HDF CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {hdfFileName && <span className="muted">{hdfFileName}</span>}
            {hdfResult && "error" in hdfResult && (
              <span className="error">Error: {hdfResult.error}</span>
            )}
            {hdfResult && "stats" in hdfResult && (
              <span className="muted">
                {hdfResult.stats.weekdayDays} weekdays +{" "}
                {hdfResult.stats.weekendDays} weekend days,{" "}
                annualised ~{Math.round(hdfResult.stats.annualisedKwh)} kWh
                {hdfResult.stats.rowsAfterEvCutoff > 0 &&
                  ` (${hdfResult.stats.rowsAfterEvCutoff} rows after EV cutoff)`}
              </span>
            )}
          </label>
        )}

        <label className="field">
          Meter type
          <select
            value={meterType}
            onChange={(e) => setMeterType(e.target.value as MeterType)}
          >
            <option value="smart">Smart meter</option>
            <option value="day_night">Day/Night (MCC02 legacy)</option>
            <option value="standard_24hr">Standard 24hr (non-smart)</option>
          </select>
        </label>

        <label className="field">
          <input
            type="checkbox"
            checked={hasGas}
            onChange={(e) => setHasGas(e.target.checked)}
          />
          {" "}I have gas
        </label>

        {hasGas && (
          <label className="field">
            Annual gas kWh
            <input
              type="number"
              min={0}
              max={50000}
              step={500}
              value={annualGasKwh}
              onChange={(e) => setAnnualGasKwh(Number(e.target.value))}
            />
          </label>
        )}

        <label className="field">
          <input
            type="checkbox"
            checked={hasEv}
            onChange={(e) => setHasEv(e.target.checked)}
          />
          {" "}I have an EV (charged at home)
        </label>

        {hasEv && (
          <label className="field">
            Annual EV charging kWh
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={annualEvKwh}
              onChange={(e) => setAnnualEvKwh(Number(e.target.value))}
            />
            <span className="muted">
              {" "}(assumed scheduled to cheapest band)
            </span>
          </label>
        )}

        {mode === "hdf" && hasEv && (
          <label className="field">
            EV charging started on (optional)
            <input
              type="date"
              value={evStartDate}
              onChange={(e) => setEvStartDate(e.target.value)}
            />
            <span className="muted">
              {" "}Skips readings on/after this date so the baseload isn't
              inflated by EV charging.
            </span>
          </label>
        )}
      </section>

      {ranking && (
        <section>
          <h2>
            Ranking ({ranking.length} combos
            {series && `, modelled at ${Math.round(series.derivedAnnualKwh)} kWh elec`})
          </h2>
          {ranking.length === 0 ? (
            <p className="muted">
              No plans match these constraints. Try changing meter type or
              toggling gas/EV.
            </p>
          ) : (
            <table className="ranking">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Plan</th>
                  <th className="num">Annual €</th>
                  <th className="num">vs best</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row, i) => {
                  const delta = row.annualEur - ranking[0].annualEur;
                  return (
                    <tr key={row.combo.id} className={i === 0 ? "best" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        <div>{row.combo.label}</div>
                        <div className="muted">
                          {row.combo.elec.supplier}
                          {row.combo.gas
                            ? ` + ${row.combo.gas.supplier} gas`
                            : ""}
                        </div>
                      </td>
                      <td className="num">{row.annualEur.toFixed(0)}</td>
                      <td className="num">
                        {i === 0 ? "—" : `+${delta.toFixed(0)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
