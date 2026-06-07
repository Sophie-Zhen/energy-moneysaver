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
import type { MeterType } from "./types";

type RankedCombo = { combo: Combo; annualEur: number };

export function App() {
  const [snapshot, setSnapshot] = useState<TariffSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [annualElecKwh, setAnnualElecKwh] = useState(3500);
  const [hasGas, setHasGas] = useState(true);
  const [annualGasKwh, setAnnualGasKwh] = useState(12_000);
  const [hasEv, setHasEv] = useState(false);
  const [annualEvKwh, setAnnualEvKwh] = useState(2_000);
  const [meterType, setMeterType] = useState<MeterType>("smart");

  useEffect(() => {
    Promise.all([fetchTariffSnapshot(), fetchProfiles()])
      .then(([snap, profiles]) => {
        setSnapshot(snap);
        setProfile(profiles[DEFAULT_PROFILE_ID] ?? null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const ranking: RankedCombo[] | null = useMemo(() => {
    if (!snapshot || !profile) return null;

    const [weekday, weekend] = scaleProfileToAnnualKwh(
      profile.weekday,
      profile.weekend,
      annualElecKwh,
    );

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
              weekdayHourly: weekday,
              weekendHourly: weekend,
              elecPlan: combo.elec,
              gasPlan: combo.gas,
              gasAnnualKwh: annualGasKwh,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            })
          : annualElectricityOnlyCostEur({
              weekdayHourly: weekday,
              weekendHourly: weekend,
              elecPlan: combo.elec,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            });
        return { combo, annualEur };
      })
      .sort((a, b) => a.annualEur - b.annualEur);
  }, [
    snapshot,
    profile,
    annualElecKwh,
    hasGas,
    annualGasKwh,
    hasEv,
    annualEvKwh,
    meterType,
  ]);

  return (
    <main>
      <h1>energy-moneysaver</h1>
      <p className="muted">
        Compare Irish electricity {hasGas ? "& gas " : ""}plans for your
        household. Form mode uses the default Dublin residential load profile
        scaled to your annual kWh; for higher accuracy, upload an ESB Networks
        HDF export (coming in M3).
      </p>

      {loadError && (
        <div className="result" role="alert">
          Could not load catalogue: {loadError}
        </div>
      )}

      <section className="form-grid">
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
            <span className="muted"> (assumed scheduled to cheapest band)</span>
          </label>
        )}
      </section>

      {ranking && (
        <section>
          <h2>Ranking ({ranking.length} combos)</h2>
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
                          {row.combo.gas ? ` + ${row.combo.gas.supplier} gas` : ""}
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
