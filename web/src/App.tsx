import { useEffect, useMemo, useState } from "react";

import { fetchTariffSnapshot, type TariffSnapshot } from "./data/tariffLoader";
import {
  fetchProfiles,
  scaleProfileToAnnualKwh,
  DEFAULT_PROFILE_ID,
  type Profile,
} from "./data/profiles";
import {
  annualDualFuelCostEur,
  annualElectricityOnlyCostEur,
  evDistributionFor,
  electricityBreakdown,
  exportCreditEur,
  gasBreakdown,
  usageKwhByBand,
  negotiateTarget,
  type UsageBandSplit,
} from "./domain/simulator";
import { buildCombos, type Combo, type UserConstraints } from "./domain/planner";
import { projectElectricity, projectGas } from "./domain/hikes";
import { parseHdfCsv, type HdfParseResult } from "./data/hdfParser";
import {
  LangContext,
  STRINGS,
  detectLang,
  persistLang,
  type Lang,
} from "./i18n";
import type {
  HourlySeries,
  MeterType,
} from "./domain/types";
import type { ComboBreakdown, Mode, RankedCombo } from "./viewModel";
import { AnswerHero } from "./components/AnswerHero";
import { CostBreakdown } from "./components/CostBreakdown";
import { LangToggle } from "./components/LangToggle";
import { ModellingDisclosure } from "./components/ModellingDisclosure";
import { Negotiate } from "./components/Negotiate";
import { RankingRow } from "./components/RankingRow";
import { SolarExport } from "./components/SolarExport";
import { SwitchTiming } from "./components/SwitchTiming";
import { WhyCheapest } from "./components/WhyCheapest";

export function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const t = STRINGS[lang];

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

        const evDist = evDistributionFor(elec, hasEv);
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
      const evDist = evDistributionFor(combo.elec, hasEv);
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

  const base = import.meta.env.BASE_URL;
  const helpSuffix = lang === "zh" ? ".zh" : "";

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      <main>
        <header className="masthead">
          <span className="logo" aria-hidden="true">
            <svg width="42" height="42" viewBox="0 0 42 42" role="img">
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#16a35f" />
                  <stop offset="1" stopColor="#0a7d57" />
                </linearGradient>
              </defs>
              <rect width="42" height="42" rx="11" fill="url(#logo-grad)" />
              <g stroke="#fff" strokeWidth="2.1" strokeLinecap="round">
                <line x1="21" y1="9" x2="21" y2="5.5" />
                <line x1="21" y1="33" x2="21" y2="36.5" />
                <line x1="33" y1="21" x2="36.5" y2="21" />
                <line x1="9" y1="21" x2="5.5" y2="21" />
                <line x1="29.5" y1="12.5" x2="32" y2="10" />
                <line x1="12.5" y1="29.5" x2="10" y2="32" />
                <line x1="29.5" y1="29.5" x2="32" y2="32" />
                <line x1="12.5" y1="12.5" x2="10" y2="10" />
              </g>
              <text
                x="21"
                y="22"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="system-ui, sans-serif"
                fontSize="17"
                fontWeight="700"
                fill="#fff"
              >
                €
              </text>
            </svg>
          </span>
          <div>
            <h1>energy-moneysaver</h1>
            <p className="tagline">{t.tagline}</p>
          </div>
          <LangToggle />
        </header>
        <p className="muted">{t.intro(hasGas)}</p>

        {loadError && (
          <div className="result" role="alert">
            {t.loadError(loadError)}
          </div>
        )}

        <fieldset className="mode-toggle">
          <legend className="muted">{t.inputMode}</legend>
          <label>
            <input
              type="radio"
              name="mode"
              value="form"
              checked={mode === "form"}
              onChange={() => setMode("form")}
            />
            {" "}
            {t.formMode}
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="hdf"
              checked={mode === "hdf"}
              onChange={() => setMode("hdf")}
            />
            {" "}
            {t.hdfMode}
          </label>
        </fieldset>

        <section className="form-grid">
          {ranking && ranking.length > 0 && (
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              {t.currentPlanLabel}
              <select
                value={currentComboId ?? ""}
                onChange={(e) => setCurrentComboId(e.target.value || null)}
              >
                <option value="">{t.selectCurrentPlan}</option>
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
              {t.contractEndLabel}
              <input
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
              />
              <span className="muted">{t.contractEndHint}</span>
            </label>
          )}

          {mode === "form" && (
            <label className="field">
              {t.annualElecKwh}
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
              {t.hdfFile}
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {hdfFileName && <span className="muted">{hdfFileName}</span>}
              {hdfResult && "error" in hdfResult && (
                <span className="error">{t.hdfError(hdfResult.error)}</span>
              )}
              {hdfResult && "stats" in hdfResult && (
                <span className="muted">
                  {t.hdfStats(
                    hdfResult.stats.weekdayDays,
                    hdfResult.stats.weekendDays,
                    Math.round(hdfResult.stats.annualisedKwh),
                    hdfResult.stats.rowsAfterEvCutoff,
                  )}
                </span>
              )}
            </label>
          )}

          {/* One data-guide link, always shown. It sits right after the input
              field, which is the annual-kWh field in form mode and the HDF file
              field in HDF mode, so it's adjacent to the input in both — no need
              to duplicate it per mode. The text covers both cases. */}
          <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
            {t.dataGuideAsk}
            <a
              href={`${base}data_guide${helpSuffix}.html`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.dataGuide}
            </a>
          </p>

          <label className="field">
            {t.meterType}
            <select
              value={meterType}
              onChange={(e) => setMeterType(e.target.value as MeterType)}
            >
              <option value="smart">{t.meterSmart}</option>
              <option value="day_night">{t.meterDayNight}</option>
              <option value="standard_24hr">{t.meterStandard}</option>
            </select>
          </label>

          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={hasGas}
                onChange={(e) => setHasGas(e.target.checked)}
              />
              {" "}
              {t.haveGas}
            </label>
            {hasGas && (
              <label className="subfield">
                {t.annualGasKwh}
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
              {" "}
              {t.haveEv}
            </label>
            {hasEv && (
              <label className="subfield">
                {t.annualEvKwh}
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={annualEvKwh}
                  onChange={(e) => setAnnualEvKwh(Number(e.target.value))}
                />
                <span className="muted">{t.evScheduledHint}</span>
              </label>
            )}
            {mode === "hdf" && hasEv && (
              <label className="subfield">
                {t.evStartLabel}
                <input
                  type="date"
                  value={evStartDate}
                  onChange={(e) => setEvStartDate(e.target.value)}
                />
                <span className="muted">{t.evStartHint}</span>
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
              {" "}
              {t.haveSolar}
            </label>
            {hasSolar && mode === "form" && (
              <label className="subfield">
                {t.annualExportKwh}
                <input
                  type="number"
                  min={0}
                  max={20000}
                  step={100}
                  value={solarExportKwh}
                  onChange={(e) => setSolarExportKwh(Number(e.target.value))}
                />
                <span className="muted">{t.exportUploadHint}</span>
              </label>
            )}
            {hasSolar && mode === "hdf" && (
              <span className="subfield muted">
                {hdfResult && "stats" in hdfResult
                  ? hdfResult.stats.exportAnnualKwh > 0
                    ? t.exportFromHdf(
                        Math.round(hdfResult.stats.exportAnnualKwh),
                      )
                    : t.exportNoneInHdf
                  : t.exportUploadFirst}
              </span>
            )}
            {hasSolar && (
              <label className="subfield check">
                <input
                  type="checkbox"
                  checked={jointBill}
                  onChange={(e) => setJointBill(e.target.checked)}
                />
                {" "}
                {t.jointBill}
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

        {ranking && ranking.length > 0 && (
          <p className="muted">
            {t.newHere}
            <a
              href={`${base}manual${helpSuffix}.html`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.howToRead}
            </a>
          </p>
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
          <section className="all-plans">
            <h2>
              {t.allPlans(
                ranking.length,
                series ? Math.round(series.derivedAnnualKwh) : null,
              )}
            </h2>
            {ranking.length === 0 ? (
              <p className="muted">{t.noPlans}</p>
            ) : (
              <table className="ranking">
                <thead>
                  <tr>
                    <th>{t.colRank}</th>
                    <th>{t.colPlan}</th>
                    <th className="num">{t.colAnnualEur}</th>
                    <th className="num">{t.colVsBest}</th>
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
    </LangContext.Provider>
  );
}
