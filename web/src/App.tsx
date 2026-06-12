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
  electricityBreakdown,
  exportRevenue,
  gasBreakdown,
  usageKwhByBand,
  negotiateTarget,
  type ElectricityBreakdown,
  type GasBreakdown,
  type UsageBandSplit,
  type NegotiateTarget,
} from "./simulator";
import { buildCombos, type Combo, type UserConstraints } from "./planner";
import { projectElectricity, projectGas } from "./hikes";
import { parseHdfCsv, type HdfParseResult } from "./hdfParser";
import type {
  ElectricityPlan,
  ExportRate,
  GasPlan,
  HourlySeries,
  MeterType,
} from "./types";

type Mode = "form" | "hdf";
type RankedCombo = {
  combo: Combo; // projected (post-hike) — drives the modelled cost and label
  orig: Combo; // original catalogue plans — the verified rates to check sources
  annualEur: number; // net of any solar export credit
  hiked: boolean;
  exportEur: number; // gross CEG credit netted into annualEur (0 if no solar)
  elecHikePct: number | null; // announced % applied in the projection, if any
  gasHikePct: number | null;
};
type ComboBreakdown = {
  elec: ElectricityBreakdown;
  gas: GasBreakdown | null;
  exportEur: number; // gross solar export credit for this combo's supplier
};

// Gross annual CEG credit for a combo's electricity supplier. Import and export
// must be with the same supplier (CRU rule), so the rate is looked up by the
// elec plan's supplier name. 0 if the supplier has no listed rate or no export.
function exportCreditEur(
  supplier: string,
  exportRates: Record<string, ExportRate>,
  exportKwh: number,
): number {
  const rate = exportRates[supplier];
  if (!rate || exportKwh <= 0) return 0;
  return (exportKwh * rate.rate_cpkwh) / 100;
}

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
  const [hasSolar, setHasSolar] = useState(false);
  const [solarExportKwh, setSolarExportKwh] = useState(2_000);
  const [jointBill, setJointBill] = useState(false);
  const [meterType, setMeterType] = useState<MeterType>("smart");

  const [hdfFileName, setHdfFileName] = useState<string | null>(null);
  const [hdfText, setHdfText] = useState<string | null>(null);
  const [evStartDate, setEvStartDate] = useState<string>(""); // YYYY-MM-DD

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentComboId, setCurrentComboId] = useState<string | null>(null);
  const [contractEndDate, setContractEndDate] = useState<string>(""); // YYYY-MM-DD

  // Optional contract/discount end date: roughly when the user will switch.
  const contractEnd = useMemo<Date | null>(() => {
    if (!contractEndDate) return null;
    const d = new Date(`${contractEndDate}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [contractEndDate]);

  // Anchor for time-weighting announced hikes: the switch date if the user gave
  // a contract-end date, otherwise today.
  const referenceDate = useMemo(() => contractEnd ?? new Date(), [contractEnd]);

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

  // Annual exported kWh: from the HDF's Active Export rows when uploaded,
  // otherwise the manual estimate. 0 unless the user has solar.
  const effectiveExportKwh = useMemo(() => {
    if (!hasSolar) return 0;
    if (mode === "hdf") {
      return hdfResult && "stats" in hdfResult
        ? hdfResult.stats.exportAnnualKwh
        : 0;
    }
    return solarExportKwh;
  }, [hasSolar, mode, hdfResult, solarExportKwh]);

  // Tax-free export cap: €400 per named account holder, €800 jointly-named.
  const taxFreeCapEur = jointBill ? 800 : 400;

  const ranking: RankedCombo[] | null = useMemo(() => {
    if (!snapshot || !series) return null;
    const constraints: UserConstraints = { hasGas, hasEv, meterType };
    const combos = buildCombos(snapshot, constraints);

    return combos
      .map((combo) => {
        // Project to the next 12 months: apply announced hikes to pre-hike
        // plans so the ranking reflects what you'll actually pay.
        const elecProj = projectElectricity(combo.elec, snapshot.hikes, referenceDate);
        const gasProj = combo.gas
          ? projectGas(combo.gas, snapshot.hikes, referenceDate)
          : null;
        const elec = elecProj.plan;
        const gas = gasProj?.plan ?? null;
        const hiked = elecProj.hikePct != null || gasProj?.hikePct != null;
        const projectedCombo: Combo = { ...combo, elec, gas };

        const evDist =
          hasEv && elec.kind === "bands"
            ? cheapestBandEvDistribution(elec)
            : undefined;
        const effectiveEvKwh = hasEv ? annualEvKwh : 0;

        const grossCost = gas
          ? annualDualFuelCostEur({
              weekdayHourly: series.weekday,
              weekendHourly: series.weekend,
              elecPlan: elec,
              gasPlan: gas,
              gasAnnualKwh: annualGasKwh,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            })
          : annualElectricityOnlyCostEur({
              weekdayHourly: series.weekday,
              weekendHourly: series.weekend,
              elecPlan: elec,
              evAnnualKwh: effectiveEvKwh,
              evDistribution: evDist,
            });
        // Solar export credit is tied to the elec supplier (same-supplier rule)
        // and netted off, so a generous CEG rate can change the ranking.
        const exportEur = exportCreditEur(
          elec.supplier,
          snapshot.exportRates,
          effectiveExportKwh,
        );
        return {
          combo: projectedCombo,
          orig: combo,
          annualEur: grossCost - exportEur,
          hiked,
          exportEur,
          elecHikePct: elecProj.hikePct,
          gasHikePct: gasProj?.hikePct ?? null,
        };
      })
      .sort((a, b) => a.annualEur - b.annualEur);
  }, [snapshot, series, hasGas, annualGasKwh, hasEv, annualEvKwh, meterType, referenceDate, effectiveExportKwh]);

  // Per-component breakdown of the cheapest plan (and the current plan, if
  // chosen) for the "where the money goes / where the saving comes from" view.
  const breakdowns = useMemo(() => {
    if (!ranking || ranking.length === 0 || !series) return null;
    const mk = (combo: Combo): ComboBreakdown => {
      const evDist =
        hasEv && combo.elec.kind === "bands"
          ? cheapestBandEvDistribution(combo.elec)
          : undefined;
      return {
        elec: electricityBreakdown({
          weekdayHourly: series.weekday,
          weekendHourly: series.weekend,
          elecPlan: combo.elec,
          evAnnualKwh: hasEv ? annualEvKwh : 0,
          evDistribution: evDist,
        }),
        gas: combo.gas ? gasBreakdown(combo.gas, annualGasKwh) : null,
        exportEur: snapshot
          ? exportCreditEur(
              combo.elec.supplier,
              snapshot.exportRates,
              effectiveExportKwh,
            )
          : 0,
      };
    };
    const bestRanked = ranking[0];
    const curRanked =
      ranking.find((r) => r.combo.id === currentComboId) ?? null;
    return {
      bestCombo: bestRanked.combo,
      best: mk(bestRanked.combo),
      curCombo: curRanked?.combo ?? null,
      cur: curRanked ? mk(curRanked.combo) : null,
      bestRanked,
      curRanked,
    };
  }, [ranking, series, snapshot, currentComboId, hasEv, annualEvKwh, annualGasKwh, effectiveExportKwh]);

  // The household's electricity usage shape (night/day/peak) — evidence for
  // "why this plan wins". Plan-agnostic; excludes EV (see usageKwhByBand).
  const usageSplit = useMemo<UsageBandSplit | null>(() => {
    if (!series) return null;
    return usageKwhByBand({
      weekdayHourly: series.weekday,
      weekendHourly: series.weekend,
    });
  }, [series]);

  // Stay-and-negotiate: what unit-rate cut would make the current plan match
  // the cheapest switch — on the ongoing rate, and on the full first-year deal.
  const negotiate = useMemo(() => {
    if (!breakdowns?.cur || !breakdowns.curCombo) return null;
    if (breakdowns.curCombo.id === breakdowns.bestCombo.id) return null;
    const { cur, best } = breakdowns;
    const total = (b: ComboBreakdown) =>
      b.elec.totalEur + (b.gas?.totalEur ?? 0) - b.exportEur;
    const units =
      cur.elec.nightEur +
      cur.elec.dayEur +
      cur.elec.peakEur +
      (cur.gas?.unitsEur ?? 0);
    // Export credit is tied to the (unchanged) current supplier and doesn't
    // scale with the import rate, so it's a fixed offset — negotiating can't
    // move it. The target (best total) already nets the best supplier's higher
    // export rate, so this asks: how much import cut matches staying put?
    const fixed =
      cur.elec.standingEur +
      cur.elec.psoLevyEur -
      cur.elec.welcomeCreditEur -
      cur.exportEur +
      (cur.gas
        ? cur.gas.carbonTaxEur + cur.gas.standingEur - cur.gas.welcomeCreditEur
        : 0);
    const cheapestCost = total(best);
    const currentCost = total(cur);
    if (currentCost <= cheapestCost + 0.5) return null;
    const bestWelcome =
      best.elec.welcomeCreditEur + (best.gas?.welcomeCreditEur ?? 0);
    return {
      currentCost,
      cheapestCost,
      bestWelcome,
      firstYearTarget: cheapestCost,
      ongoingTarget: cheapestCost + bestWelcome,
      firstYear: negotiateTarget(units, fixed, cheapestCost),
      ongoing: negotiateTarget(units, fixed, cheapestCost + bestWelcome),
    };
  }, [breakdowns]);

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
      <p className="muted">
        New here?{" "}
        <a
          href={`${import.meta.env.BASE_URL}manual.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          How to read your result →
        </a>
        {"  ·  "}
        Not sure where to find your annual kWh or how to download an HDF?{" "}
        <a
          href={`${import.meta.env.BASE_URL}data_guide.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Data guide →
        </a>
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
        {ranking && ranking.length > 0 && (
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Your current plan (to see your saving)
            <select
              value={currentComboId ?? ""}
              onChange={(e) => setCurrentComboId(e.target.value || null)}
            >
              <option value="">— select your current plan —</option>
              {[...ranking]
                .sort((a, b) => a.combo.label.localeCompare(b.combo.label))
                .map((r) => (
                  <option key={r.combo.id} value={r.combo.id}>
                    {r.combo.label} (€{r.annualEur.toFixed(0)})
                  </option>
                ))}
            </select>
          </label>
        )}

        {ranking && ranking.length > 0 && currentComboId && (
          <label className="field">
            Current plan ends on (optional)
            <input
              type="date"
              value={contractEndDate}
              onChange={(e) => setContractEndDate(e.target.value)}
            />
            <span className="muted">
              Unlocks your switch date and anchors the price projection.
            </span>
          </label>
        )}

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

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={hasGas}
              onChange={(e) => setHasGas(e.target.checked)}
            />
            {" "}I have gas
          </label>
          {hasGas && (
            <label className="subfield">
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
        </div>

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={hasEv}
              onChange={(e) => setHasEv(e.target.checked)}
            />
            {" "}I have an EV (charged at home)
          </label>
          {hasEv && (
            <label className="subfield">
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
            <label className="subfield">
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
        </div>

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={hasSolar}
              onChange={(e) => setHasSolar(e.target.checked)}
            />
            {" "}I have solar panels (export to grid)
          </label>
          {hasSolar && mode === "form" && (
            <label className="subfield">
              Annual export kWh
              <input
                type="number"
                min={0}
                max={20000}
                step={100}
                value={solarExportKwh}
                onChange={(e) => setSolarExportKwh(Number(e.target.value))}
              />
              <span className="muted">
                {" "}Upload your HDF to read this from your meter instead.
              </span>
            </label>
          )}
          {hasSolar && mode === "hdf" && (
            <span className="subfield muted">
              {hdfResult && "stats" in hdfResult
                ? hdfResult.stats.exportAnnualKwh > 0
                  ? `Export read from your HDF: ~${Math.round(
                      hdfResult.stats.exportAnnualKwh,
                    )} kWh/yr.`
                  : "No Active Export rows found in this HDF — switch to form mode to enter an estimate."
                : "Upload your HDF above to read your export."}
            </span>
          )}
          {hasSolar && (
            <label className="subfield check">
              <input
                type="checkbox"
                checked={jointBill}
                onChange={(e) => setJointBill(e.target.checked)}
              />
              {" "}Bill is in two names (raises tax-free export to €800)
            </label>
          )}
        </div>
      </section>

      {ranking && ranking.length > 0 && (
        <AnswerHero
          cheapest={ranking[0]}
          current={
            ranking.find((r) => r.combo.id === currentComboId) ?? null
          }
        />
      )}

      {breakdowns && <CostBreakdown {...breakdowns} />}

      {usageSplit && breakdowns && (
        <WhyCheapest
          split={usageSplit}
          cheapestLabel={breakdowns.bestCombo.label}
          mode={mode}
          hasEv={hasEv}
        />
      )}

      {hasSolar && snapshot && ranking && ranking.length > 0 && (
        <SolarExport
          exportKwh={effectiveExportKwh}
          cheapest={ranking[0]}
          rate={snapshot.exportRates[ranking[0].combo.elec.supplier]}
          taxFreeCapEur={taxFreeCapEur}
          jointBill={jointBill}
          mode={mode}
        />
      )}

      {negotiate && <Negotiate {...negotiate} />}

      {ranking &&
        ranking.length > 0 &&
        ranking[0].combo.id !== currentComboId && (
          <SwitchTiming contractEnd={contractEnd} />
        )}

      {ranking && (
        <section>
          <h2>
            All plans ({ranking.length} combos
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
                  const isExpanded = expandedId === row.combo.id;
                  const toggle = () =>
                    setExpandedId(isExpanded ? null : row.combo.id);
                  return (
                    <RankingRow
                      key={row.combo.id}
                      row={row}
                      rank={i + 1}
                      delta={delta}
                      isBest={i === 0}
                      isExpanded={isExpanded}
                      onToggle={toggle}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
          {ranking.length > 0 && <ModellingDisclosure />}
        </section>
      )}
    </main>
  );
}

function AnswerHero({
  cheapest,
  current,
}: {
  cheapest: RankedCombo;
  current: RankedCombo | null;
}) {
  if (!current) {
    return (
      <section className="answer">
        <p className="muted">Cheapest for you, next 12 months</p>
        <p className="answer-headline">
          {cheapest.combo.label}{" "}
          <span className="answer-num">€{cheapest.annualEur.toFixed(0)}/yr</span>
        </p>
        <p className="muted">
          Select your current plan above to see how much you'd save.
        </p>
      </section>
    );
  }

  const savings = current.annualEur - cheapest.annualEur;
  const alreadyBest = current.combo.id === cheapest.combo.id || savings < 1;

  if (alreadyBest) {
    return (
      <section className="answer">
        <p className="answer-headline">You're already on the cheapest plan ✅</p>
        <p className="muted">
          {current.combo.label} · €{current.annualEur.toFixed(0)}/yr. Nothing to
          do.
        </p>
      </section>
    );
  }

  return (
    <section className="answer">
      <p className="muted">Your plan vs the cheapest for you — next 12 months</p>
      <p className="answer-headline">
        €{current.annualEur.toFixed(0)} → €{cheapest.annualEur.toFixed(0)}
        <span className="answer-save"> save €{savings.toFixed(0)}/yr</span>
      </p>
      <p className="muted">
        Current: {current.combo.label}. Cheapest: {cheapest.combo.label}.
      </p>
      {current.hiked && (
        <p className="muted">
          ⚠️ Your current figure includes your supplier's announced July
          increase — part of why switching saves.
        </p>
      )}
    </section>
  );
}

function breakdownRows(b: ComboBreakdown) {
  const e = b.elec;
  const g = b.gas;
  return [
    { label: "Night units", v: e.nightEur },
    { label: "Day units", v: e.dayEur },
    { label: "Peak units (wkdy 17–19)", v: e.peakEur },
    { label: "Electricity standing", v: e.standingEur },
    { label: "PSO levy", v: e.psoLevyEur },
    ...(g
      ? [
          { label: "Gas units", v: g.unitsEur },
          { label: "Gas carbon tax", v: g.carbonTaxEur },
          { label: "Gas standing", v: g.standingEur },
        ]
      : []),
    {
      label: "Welcome credit",
      v: -(e.welcomeCreditEur + (g?.welcomeCreditEur ?? 0)),
    },
    ...(b.exportEur > 0
      ? [{ label: "Solar export credit", v: -b.exportEur }]
      : []),
    {
      label: "Total",
      v: e.totalEur + (g?.totalEur ?? 0) - b.exportEur,
      isTotal: true,
    },
  ];
}

function eur(v: number): string {
  return v < 0 ? `−€${Math.abs(v).toFixed(0)}` : `€${v.toFixed(0)}`;
}

// The verified catalogue rates (pre-hike) behind a combo, so a user can check
// each number against the linked source. Uses `orig`, not the projected plans,
// because the source page shows today's published rate; any announced increase
// is noted separately and applied only in the modelled cost.
function ComboRateDetail({ ranked }: { ranked: RankedCombo }) {
  const { orig, elecHikePct, gasHikePct } = ranked;
  return (
    <div className="drawer">
      <PlanDetail kind="electricity" plan={orig.elec} hikePct={elecHikePct} />
      {orig.gas && (
        <PlanDetail kind="gas" plan={orig.gas} hikePct={gasHikePct} />
      )}
    </div>
  );
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function ElectricityRateLines({ plan }: { plan: ElectricityPlan }) {
  return (
    <>
      <table className="rate-lines">
        <tbody>
          {plan.kind === "flat" ? (
            <tr>
              <td>Unit rate (24 hr)</td>
              <td className="num">{(plan.rate_cpkwh ?? 0).toFixed(2)} c/kWh</td>
            </tr>
          ) : (
            (plan.bands ?? []).map((b, i) => (
              <tr key={i}>
                <td>
                  {b.label ? `${b.label} ` : ""}
                  {fmtHour(b.hours[0])}–{fmtHour(b.hours[1])}
                </td>
                <td className="num">{b.rate_cpkwh.toFixed(2)} c/kWh</td>
              </tr>
            ))
          )}
          <tr>
            <td>Standing charge</td>
            <td className="num">
              €{plan.standing_eur_per_year.toFixed(2)}/yr
            </td>
          </tr>
          {plan.welcome_credit_eur > 0 && (
            <tr>
              <td>Welcome credit</td>
              <td className="num">−€{plan.welcome_credit_eur.toFixed(0)} once</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="rate-note muted">
        Inc VAT
        {plan.discount_pct > 0
          ? ` and the ${plan.discount_pct}% discount (both already in the rates above)`
          : ""}
        . PSO levy (€19.10/yr) is added by the model, not the supplier.
      </p>
    </>
  );
}

function GasRateLines({ plan }: { plan: GasPlan }) {
  return (
    <>
      <table className="rate-lines">
        <tbody>
          <tr>
            <td>Unit rate</td>
            <td className="num">{plan.rate_cpkwh.toFixed(2)} c/kWh</td>
          </tr>
          <tr>
            <td>Standing charge</td>
            <td className="num">
              €{plan.standing_eur_per_year.toFixed(2)}/yr
            </td>
          </tr>
          {plan.welcome_credit_eur > 0 && (
            <tr>
              <td>Welcome credit</td>
              <td className="num">−€{plan.welcome_credit_eur.toFixed(0)} once</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="rate-note muted">
        Inc VAT
        {plan.discount_pct > 0 ? `, ${plan.discount_pct}% discount included` : ""}
        ; carbon tax (1.25 c/kWh) is added by the model.
      </p>
    </>
  );
}

function CostBreakdown({
  bestCombo,
  best,
  curCombo,
  cur,
  bestRanked,
  curRanked,
}: {
  bestCombo: Combo;
  best: ComboBreakdown;
  curCombo: Combo | null;
  cur: ComboBreakdown | null;
  bestRanked: RankedCombo;
  curRanked: RankedCombo | null;
}) {
  const bestRows = breakdownRows(best);
  const curRows = cur ? breakdownRows(cur) : null;
  const hasCur = curRows != null;
  const bestLabel = bestCombo.label;
  const curLabel = curCombo?.label ?? null;
  return (
    <section className="breakdown">
      <h2>Cost breakdown</h2>
      <table className="breakdown-table">
        <thead>
          <tr>
            <th>Component</th>
            {hasCur && <th className="num">Current</th>}
            <th className="num">{hasCur ? "Cheapest" : "Annual"}</th>
            {hasCur && <th className="num">You save</th>}
          </tr>
        </thead>
        <tbody>
          {bestRows.map((br, i) => {
            const cv = curRows ? curRows[i].v : null;
            const saving = cv != null ? cv - br.v : null;
            return (
              <tr key={br.label} className={br.isTotal ? "total" : ""}>
                <td>{br.label}</td>
                {hasCur && <td className="num">{cv != null ? eur(cv) : "—"}</td>}
                <td className="num">{eur(br.v)}</td>
                {hasCur && (
                  <td className="num">
                    {saving != null && Math.abs(saving) >= 0.5 ? (
                      <span className={saving > 0 ? "save-pos" : "save-neg"}>
                        {eur(saving)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        {hasCur
          ? `Current: ${curLabel}. Cheapest: ${bestLabel}. "You save" is current minus cheapest per line.`
          : `Cheapest for you: ${bestLabel}. Pick your current plan above to compare it line by line.`}
      </p>
      <details className="modelling">
        <summary>Rates &amp; sources for these plans</summary>
        <h3 className="rates-heading">Cheapest: {bestLabel}</h3>
        <ComboRateDetail ranked={bestRanked} />
        {curRanked && (
          <>
            <h3 className="rates-heading">Current: {curLabel}</h3>
            <ComboRateDetail ranked={curRanked} />
          </>
        )}
      </details>
    </section>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function SwitchTiming({ contractEnd }: { contractEnd: Date | null }) {
  const submit = contractEnd ? addDays(contractEnd, 1) : null;
  return (
    <section className="timing">
      <h2>If you switch: when and how</h2>
      {submit ? (
        <p>
          Submit your switch around <strong>{fmtDate(submit)}</strong> — the day
          after your current plan ends.
        </p>
      ) : (
        <p>
          Submit the day after your fixed contract or discount ends. Find that
          date on your bill or welcome email and enter it above for an exact day.
        </p>
      )}
      <ul className="timing-list">
        <li>
          <span className="badge confidence-fact">FACT</span> Switching before
          your end date can trigger an early-exit fee (≈€50); it stops applying
          once the contract ends.
        </li>
        <li>
          <span className="badge confidence-third_party">FORUM</span> Some people
          who switched on the exact end date were auto-charged the fee and had to
          dispute it — a day later is safer.
        </li>
        <li>
          <span className="badge confidence-fact">FACT</span> The switch takes
          ~10–15 working days; you can waive the 14-day cooling-off to speed it
          up.
        </li>
        <li>
          <span className="badge confidence-fact">FACT</span> Every day past your
          end date sits on the higher standard rate — don't drag it out.
        </li>
        <li>
          <span className="badge">CHECK</span> Confirm your exact end date in
          your supplier account before scheduling anything.
        </li>
      </ul>
    </section>
  );
}

function Negotiate({
  currentCost,
  cheapestCost,
  bestWelcome,
  firstYearTarget,
  ongoingTarget,
  firstYear,
  ongoing,
}: {
  currentCost: number;
  cheapestCost: number;
  bestWelcome: number;
  firstYearTarget: number;
  ongoingTarget: number;
  firstYear: NegotiateTarget;
  ongoing: NegotiateTarget;
}) {
  const saving = currentCost - cheapestCost;
  const hasBonus = bestWelcome >= 0.5;
  return (
    <section className="negotiate">
      <h2>Best option: stay and negotiate</h2>
      <p>
        Switching saves about <strong>€{saving.toFixed(0)}/yr</strong>, but
        staying is less hassle if your current supplier matches it. What to ask
        for:
      </p>
      <ul>
        {firstYear.feasible ? (
          <li>
            <strong>≈{Math.round(firstYear.reductionPct)}% off your current
            rates</strong>{" "}
            matches their first-year deal
            {hasBonus
              ? ` including the €${bestWelcome.toFixed(0)} sign-up bonus`
              : ""}{" "}
            (≈€{firstYearTarget.toFixed(0)}/yr).
          </li>
        ) : (
          <li>
            Even free units wouldn't match — your standing charges and other
            fixed costs alone exceed the cheapest switch. Switching is the only
            way to save here.
          </li>
        )}
        {hasBonus &&
          (ongoing.reductionPct > 0.5 ? (
            <li>
              <strong>≈{Math.round(ongoing.reductionPct)}% off</strong> matches
              their ongoing rate once the one-off bonus is gone (≈€
              {ongoingTarget.toFixed(0)}/yr) — enough to win from year 2.
            </li>
          ) : (
            <li>
              Your current ongoing rate already beats theirs — their deal only
              wins in year 1 thanks to the €{bestWelcome.toFixed(0)} bonus.
              Staying may be cheaper long-term.
            </li>
          ))}
      </ul>
      <p className="muted">
        These are targets to aim for on the call, not a promise they'll offer
        them. Most Irish suppliers have a retention team — ask before you cancel.
      </p>
    </section>
  );
}

function SolarExport({
  exportKwh,
  cheapest,
  rate,
  taxFreeCapEur,
  jointBill,
  mode,
}: {
  exportKwh: number;
  cheapest: RankedCombo;
  rate: ExportRate | undefined;
  taxFreeCapEur: number;
  jointBill: boolean;
  mode: Mode;
}) {
  if (exportKwh <= 0) {
    return (
      <section className="solar">
        <h2>Your solar export</h2>
        <p className="muted">
          {mode === "hdf"
            ? "No export readings found in your HDF. Switch to form mode to enter an annual export estimate."
            : "Enter your annual export kWh above to see your export credit."}
        </p>
      </section>
    );
  }
  const supplier = cheapest.combo.elec.supplier;
  const rev = rate
    ? exportRevenue(exportKwh, rate.rate_cpkwh, taxFreeCapEur)
    : null;
  return (
    <section className="solar">
      <h2>Your solar export</h2>
      {rev && rate ? (
        <>
          <p>
            You export ~<strong>{Math.round(exportKwh)} kWh/yr</strong>. The
            cheapest plan is with <strong>{supplier}</strong>, which pays{" "}
            <strong>{rate.rate_cpkwh.toFixed(2)} c/kWh</strong> — a{" "}
            <strong>€{rev.grossEur.toFixed(0)}/yr</strong> credit, already
            subtracted in the figures above.
          </p>
          <p className="muted">
            Export must be with the same supplier as your import (CRU rule), so
            the export rate is tied to whichever plan you choose — it's baked
            into each plan's ranking, not a separate switch.
          </p>
          <ul className="timing-list">
            <li>
              <span
                className={`badge confidence-${rate.source.confidence.toLowerCase()}`}
              >
                {rate.source.confidence}
              </span>{" "}
              {supplier} export rate {rate.rate_cpkwh.toFixed(2)} c/kWh
              (verified {rate.source.verified_on}).
            </li>
            {rev.taxableExcessEur > 0 ? (
              <li>
                <span className="badge confidence-third_party">TAX</span> Export
                income is tax-free up to €{taxFreeCapEur}/yr
                {jointBill ? " (jointly-named bill)" : ""}. Yours is ~€
                {rev.grossEur.toFixed(0)}, so ~€
                {rev.taxableExcessEur.toFixed(0)} is taxable at your marginal
                rate. The figures above use the gross credit (what hits your
                bill).
              </li>
            ) : (
              <li>
                <span className="badge confidence-fact">FACT</span> Export
                income is tax-free up to €{taxFreeCapEur}/yr
                {jointBill ? " (jointly-named bill)" : ""}; you're under it, so
                no tax applies (in force to end-2028).
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="muted">
          No published export rate for {supplier} yet, so no credit is applied
          to the cheapest plan. Other suppliers do publish one — see the ranking.
        </p>
      )}
    </section>
  );
}

function WhyCheapest({
  split,
  cheapestLabel,
  mode,
  hasEv,
}: {
  split: UsageBandSplit;
  cheapestLabel: string;
  mode: Mode;
  hasEv: boolean;
}) {
  const total = split.nightKwh + split.dayKwh + split.peakKwh;
  if (total <= 0) return null;
  const bands = [
    { key: "night", label: "Night", pct: (split.nightKwh / total) * 100 },
    { key: "day", label: "Day", pct: (split.dayKwh / total) * 100 },
    { key: "peak", label: "Peak", pct: (split.peakKwh / total) * 100 },
  ];
  const dominant = bands.reduce((a, b) => (b.pct > a.pct ? b : a));
  const dom = dominant.label.toLowerCase();
  return (
    <section className="why">
      <h2>Why this is cheapest for you</h2>
      <div
        className="why-bar"
        role="img"
        aria-label={bands.map((b) => `${b.label} ${b.pct.toFixed(0)}%`).join(", ")}
      >
        {bands.map(
          (b) =>
            b.pct > 0 && (
              <div
                key={b.key}
                className={`why-seg seg-${b.key}`}
                style={{ width: `${b.pct}%` }}
              >
                {b.pct >= 8 ? `${b.label} ${b.pct.toFixed(0)}%` : ""}
              </div>
            ),
        )}
      </div>
      <p>
        Most of your electricity is used in the <strong>{dom}</strong> window (
        {dominant.pct.toFixed(0)}%), so plans that price {dom} cheaply — like{" "}
        <strong>{cheapestLabel}</strong> — come out ahead for you.
        {hasEv &&
          " Your EV charging is scheduled to each plan's cheapest band on top of this."}
      </p>
      <p className="muted">
        {mode === "hdf"
          ? "Based on your uploaded half-hourly data."
          : "Based on a typical household profile — upload your HDF for your real shape."}{" "}
        Usage shape excludes EV charging.
      </p>
    </section>
  );
}

function RankingRow({
  row,
  rank,
  delta,
  isBest,
  isExpanded,
  onToggle,
}: {
  row: RankedCombo;
  rank: number;
  delta: number;
  isBest: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { combo, annualEur } = row;
  return (
    <>
      <tr
        className={`${isBest ? "best " : ""}${isExpanded ? "expanded" : ""}`}
        onClick={onToggle}
      >
        <td>
          <span aria-hidden="true" className="caret">
            {isExpanded ? "▾" : "▸"}
          </span>{" "}
          {rank}
        </td>
        <td>
          <div>{combo.label}</div>
          <div className="muted">
            {combo.elec.supplier}
            {combo.gas ? ` + ${combo.gas.supplier} gas` : ""}
          </div>
        </td>
        <td className="num">{annualEur.toFixed(0)}</td>
        <td className="num">{rank === 1 ? "—" : `+${delta.toFixed(0)}`}</td>
      </tr>
      {isExpanded && (
        <tr className="drawer-row">
          <td colSpan={4}>
            <ComboRateDetail ranked={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlanDetail({
  kind,
  plan,
  hikePct,
}: {
  kind: "electricity" | "gas";
  plan: ElectricityPlan | GasPlan;
  hikePct: number | null;
}) {
  const { source, label, supplier, notes } = plan;
  const href = extractHref(source.url);
  const title = `${kind === "electricity" ? "Electricity" : "Gas"}: ${supplier}`;
  return (
    <div className="plan-detail">
      <h3>{title}</h3>
      <div className="muted">{label}</div>
      <div className="badges">
        <span className={`badge confidence-${source.confidence.toLowerCase()}`}>
          {source.confidence}
        </span>
        <span className="badge verified-on">
          verified {source.verified_on}
        </span>
      </div>
      {kind === "electricity" ? (
        <ElectricityRateLines plan={plan as ElectricityPlan} />
      ) : (
        <GasRateLines plan={plan as GasPlan} />
      )}
      {hikePct != null && (
        <p className="notes muted">
          ⚠️ {supplier} announced a +{hikePct}% increase. These are the verified
          pre-increase rates (check them against the source); the ranking applies
          the increase, time-weighted, on top — so your modelled annual cost is
          higher than these rates alone.
        </p>
      )}
      <div className="source">
        Source:{" "}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {source.url}
          </a>
        ) : (
          source.url
        )}
      </div>
      {notes && <p className="notes muted">{notes}</p>}
    </div>
  );
}

function extractHref(raw: string): string | null {
  const first = raw.split(/\s/)[0];
  if (!first.includes(".")) return null;
  return first.startsWith("http") ? first : `https://${first}`;
}

function ModellingDisclosure() {
  return (
    <details className="modelling">
      <summary>What's modelled (and what isn't)</summary>
      <ul>
        <li>
          <strong>Included:</strong> unit rates (inc 9% VAT), standing
          charges (inc VAT), PSO levy (€19.10/year), gas carbon tax
          (1.25 c/kWh), welcome credits (deducted once).
        </li>
        <li>
          <strong>Next-12-month projection, time-weighted.</strong> Announced
          July 2026 increases — Electric Ireland (+8% elec / +7.7% gas) and Yuno
          (+9.5% / +11%) — are applied only to the part of the year after they
          take effect (1 Jul 2026), measured from today. Other suppliers are
          shown at their current rate: they're variable too and could change,
          but nothing is announced, so we don't speculate. Weighting is uniform
          over time, not by seasonal usage.
        </li>
        <li>
          <strong>Discount assumed for the full year.</strong> Most "X% off"
          deals revert to standard rates after 12 months — you may end up
          paying more in year 2 unless you switch again.
        </li>
        <li>
          <strong>Urban standing charges only.</strong> Rural standing is
          typically €60-€90/year higher; not yet modelled.
        </li>
        <li>
          <strong>EV charging assumed scheduled to each plan's cheapest
          band</strong> (e.g. via a Zappi smart charger). Without scheduling,
          the rankings could shift by €100+/year.
        </li>
        <li>
          <strong>Free Day / weekend-free plans</strong> (SSE Smart Weekends,
          BG Smart Weekend, EI Weekender) are not yet modelled.
        </li>
        <li>
          <strong>Solar export</strong> is netted at each supplier's standard
          CEG rate (import and export must be the same supplier). The gross
          credit is shown; income above €400/yr (€800 jointly-named) is taxable
          and not deducted. Conditional partner rates (e.g. SSE Activ8) are
          excluded.
        </li>
      </ul>
    </details>
  );
}
