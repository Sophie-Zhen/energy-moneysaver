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
  evDistributionFor,
  electricityBreakdown,
  exportRevenue,
  gasBreakdown,
  usageKwhByBand,
  negotiateTarget,
  type UsageBandSplit,
  type NegotiateTarget,
} from "./simulator";
import { buildCombos, type Combo, type UserConstraints } from "./planner";
import { projectElectricity, projectGas } from "./hikes";
import { parseHdfCsv, type HdfParseResult } from "./hdfParser";
import {
  LangContext,
  STRINGS,
  detectLang,
  persistLang,
  useT,
  type Lang,
  type Strings,
} from "./i18n";
import type {
  ElectricityPlan,
  ExportRate,
  GasPlan,
  HourlySeries,
  MeterType,
} from "./types";
import type { ComboBreakdown, Mode, RankedCombo } from "./viewModel";

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

function LangToggle() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t.langAria}>
      <button
        type="button"
        className={lang === "en" ? "active" : ""}
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === "zh" ? "active" : ""}
        aria-pressed={lang === "zh"}
        onClick={() => setLang("zh")}
      >
        中文
      </button>
    </div>
  );
}

function AnswerHero({
  cheapest,
  current,
}: {
  cheapest: RankedCombo;
  current: RankedCombo | null;
}) {
  const { t } = useT();
  if (!current) {
    return (
      <section className="answer">
        <p className="muted">{t.cheapestForYou}</p>
        <p className="answer-headline">
          {cheapest.combo.label}{" "}
          <span className="answer-num">
            {t.perYrEur(cheapest.annualEur.toFixed(0))}
          </span>
        </p>
        <p className="muted">{t.selectToSave}</p>
      </section>
    );
  }

  const savings = current.annualEur - cheapest.annualEur;
  const alreadyBest = current.combo.id === cheapest.combo.id || savings < 1;

  if (alreadyBest) {
    return (
      <section className="answer">
        <p className="answer-headline">{t.alreadyBestHead}</p>
        <p className="muted">
          {t.nothingToDo(current.combo.label, current.annualEur.toFixed(0))}
        </p>
      </section>
    );
  }

  return (
    <section className="answer">
      <p className="muted">{t.yourPlanVs}</p>
      <p className="answer-headline">
        €{current.annualEur.toFixed(0)} → €{cheapest.annualEur.toFixed(0)}
        <span className="answer-save">
          {t.heroSaveSuffix(savings.toFixed(0))}
        </span>
      </p>
      <p className="muted">
        {t.curCheapestLine(current.combo.label, cheapest.combo.label)}
      </p>
      {current.hiked && <p className="muted">{t.hikeNote}</p>}
    </section>
  );
}

function breakdownRows(b: ComboBreakdown, t: Strings) {
  const e = b.elec;
  const g = b.gas;
  return [
    { label: t.rowNight, v: e.nightEur },
    { label: t.rowDay, v: e.dayEur },
    { label: t.rowPeak, v: e.peakEur },
    { label: t.rowElecStanding, v: e.standingEur },
    { label: t.rowPso, v: e.psoLevyEur },
    ...(g
      ? [
          { label: t.rowGasUnits, v: g.unitsEur },
          { label: t.rowGasCarbon, v: g.carbonTaxEur },
          { label: t.rowGasStanding, v: g.standingEur },
        ]
      : []),
    {
      label: t.rowWelcome,
      v: -(e.welcomeCreditEur + (g?.welcomeCreditEur ?? 0)),
    },
    ...(b.exportEur > 0
      ? [{ label: t.rowSolarCredit, v: -b.exportEur }]
      : []),
    {
      label: t.rowTotal,
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
  const { t } = useT();
  return (
    <>
      <table className="rate-lines">
        <tbody>
          {plan.kind === "flat" ? (
            <tr>
              <td>{t.unitRate24}</td>
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
            <td>{t.standingCharge}</td>
            <td className="num">
              €{plan.standing_eur_per_year.toFixed(2)}
              {t.perYrSuffix}
            </td>
          </tr>
          {plan.welcome_credit_eur > 0 && (
            <tr>
              <td>{t.welcomeCredit}</td>
              <td className="num">
                −€{plan.welcome_credit_eur.toFixed(0)}
                {t.onceSuffix}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="rate-note muted">{t.rateNoteElec(plan.discount_pct)}</p>
    </>
  );
}

function GasRateLines({ plan }: { plan: GasPlan }) {
  const { t } = useT();
  return (
    <>
      <table className="rate-lines">
        <tbody>
          <tr>
            <td>{t.unitRate}</td>
            <td className="num">{plan.rate_cpkwh.toFixed(2)} c/kWh</td>
          </tr>
          <tr>
            <td>{t.standingCharge}</td>
            <td className="num">
              €{plan.standing_eur_per_year.toFixed(2)}
              {t.perYrSuffix}
            </td>
          </tr>
          {plan.welcome_credit_eur > 0 && (
            <tr>
              <td>{t.welcomeCredit}</td>
              <td className="num">
                −€{plan.welcome_credit_eur.toFixed(0)}
                {t.onceSuffix}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="rate-note muted">{t.rateNoteGas(plan.discount_pct)}</p>
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
  const { t } = useT();
  const bestRows = breakdownRows(best, t);
  const curRows = cur ? breakdownRows(cur, t) : null;
  const hasCur = curRows != null;
  const bestLabel = bestCombo.label;
  const curLabel = curCombo?.label ?? null;
  return (
    <section className="breakdown">
      <h2>{t.costBreakdown}</h2>
      <table className="breakdown-table">
        <thead>
          <tr>
            <th>{t.colComponent}</th>
            {hasCur && <th className="num">{t.colCurrent}</th>}
            <th className="num">{hasCur ? t.colCheapest : t.colAnnual}</th>
            {hasCur && <th className="num">{t.colYouSave}</th>}
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
          ? t.breakdownCaptionCur(curLabel as string, bestLabel)
          : t.breakdownCaptionNoCur(bestLabel)}
      </p>
      <details className="modelling">
        <summary>{t.ratesSources}</summary>
        <h3 className="rates-heading">{t.cheapestColon(bestLabel)}</h3>
        <ComboRateDetail ranked={bestRanked} />
        {curRanked && (
          <>
            <h3 className="rates-heading">
              {t.currentColon(curLabel as string)}
            </h3>
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

function fmtDate(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function SwitchTiming({ contractEnd }: { contractEnd: Date | null }) {
  const { lang, t } = useT();
  const submit = contractEnd ? addDays(contractEnd, 1) : null;
  return (
    <section className="timing">
      <h2>{t.switchTitle}</h2>
      {submit ? (
        <p>
          {t.submitAroundPre}
          <strong>{fmtDate(submit, lang)}</strong>
          {t.submitAroundPost}
        </p>
      ) : (
        <p>{t.submitGeneric}</p>
      )}
      <ul className="timing-list">
        <li>
          <span className="badge confidence-fact">FACT</span> {t.timingExitFee}
        </li>
        <li>
          <span className="badge confidence-third_party">FORUM</span>{" "}
          {t.timingForum}
        </li>
        <li>
          <span className="badge confidence-fact">FACT</span> {t.timingDuration}
        </li>
        <li>
          <span className="badge confidence-fact">FACT</span> {t.timingEveryDay}
        </li>
        <li>
          <span className="badge">CHECK</span> {t.timingCheck}
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
  const { t } = useT();
  const saving = currentCost - cheapestCost;
  const hasBonus = bestWelcome >= 0.5;
  return (
    <section className="negotiate">
      <h2>{t.negotiateTitle}</h2>
      <p>
        {t.negLeadPre}
        <strong>€{saving.toFixed(0)}/yr</strong>
        {t.negLeadPost}
      </p>
      <ul>
        {firstYear.feasible ? (
          <li>
            <strong>{t.negFirstYearBold(Math.round(firstYear.reductionPct))}</strong>
            {t.negFirstYearRest(
              hasBonus ? t.negBonusPart(bestWelcome.toFixed(0)) : "",
              firstYearTarget.toFixed(0),
            )}
          </li>
        ) : (
          <li>{t.negFirstYearInfeasible}</li>
        )}
        {hasBonus &&
          (ongoing.reductionPct > 0.5 ? (
            <li>
              <strong>{t.negOngoingBold(Math.round(ongoing.reductionPct))}</strong>
              {t.negOngoingRest(ongoingTarget.toFixed(0))}
            </li>
          ) : (
            <li>{t.negOngoingBeats(bestWelcome.toFixed(0))}</li>
          ))}
      </ul>
      <p className="muted">{t.negotiateFootnote}</p>
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
  const { t } = useT();
  if (exportKwh <= 0) {
    return (
      <section className="solar">
        <h2>{t.solarTitle}</h2>
        <p className="muted">
          {mode === "hdf" ? t.solarNoExportHdf : t.solarEnterExport}
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
      <h2>{t.solarTitle}</h2>
      {rev && rate ? (
        <>
          <p>
            {t.solarLead1}
            <strong>{t.solarKwhYr(Math.round(exportKwh))}</strong>
            {t.solarLead2}
            <strong>{supplier}</strong>
            {t.solarLead3}
            <strong>{t.solarCKwh(rate.rate_cpkwh.toFixed(2))}</strong>
            {t.solarLead4}
            <strong>{t.solarGross(rev.grossEur.toFixed(0))}</strong>
            {t.solarLead5}
          </p>
          <p className="muted">{t.solarSameSupplier}</p>
          <ul className="timing-list">
            <li>
              <span
                className={`badge confidence-${rate.source.confidence.toLowerCase()}`}
              >
                {rate.source.confidence}
              </span>{" "}
              {t.solarRateLine(
                supplier,
                rate.rate_cpkwh.toFixed(2),
                rate.source.verified_on,
              )}
            </li>
            {rev.taxableExcessEur > 0 ? (
              <li>
                <span className="badge confidence-third_party">TAX</span>{" "}
                {t.solarTaxExcess(
                  taxFreeCapEur,
                  jointBill ? t.solarJointPart : "",
                  rev.grossEur.toFixed(0),
                  rev.taxableExcessEur.toFixed(0),
                )}
              </li>
            ) : (
              <li>
                <span className="badge confidence-fact">FACT</span>{" "}
                {t.solarTaxUnder(taxFreeCapEur, jointBill ? t.solarJointPart : "")}
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="muted">{t.solarNoRate(supplier)}</p>
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
  const { t } = useT();
  const total = split.nightKwh + split.dayKwh + split.peakKwh;
  if (total <= 0) return null;
  const bands = [
    { key: "night", label: t.bandNight, pct: (split.nightKwh / total) * 100 },
    { key: "day", label: t.bandDay, pct: (split.dayKwh / total) * 100 },
    { key: "peak", label: t.bandPeak, pct: (split.peakKwh / total) * 100 },
  ];
  const dominant = bands.reduce((a, b) => (b.pct > a.pct ? b : a));
  return (
    <section className="why">
      <h2>{t.whyTitle}</h2>
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
        {t.whyLeadPre(dominant.label, dominant.pct.toFixed(0))}
        <strong>{cheapestLabel}</strong>
        {t.whyLeadPost}
        {hasEv && t.whyEvNote}
      </p>
      <p className="muted">
        {mode === "hdf" ? t.whyBasedHdf : t.whyBasedProfile}
        {t.whyExcludesEv}
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
  const { t } = useT();
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
            {combo.gas ? t.gasSuffix(combo.gas.supplier) : ""}
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
  const { t } = useT();
  const { source, label, supplier, notes } = plan;
  const href = extractHref(source.url);
  const title =
    kind === "electricity" ? t.elecTitle(supplier) : t.gasTitle(supplier);
  return (
    <div className="plan-detail">
      <h3>{title}</h3>
      <div className="muted">{label}</div>
      <div className="badges">
        <span className={`badge confidence-${source.confidence.toLowerCase()}`}>
          {source.confidence}
        </span>
        <span className="badge verified-on">{t.verifiedOn(source.verified_on)}</span>
      </div>
      {kind === "electricity" ? (
        <ElectricityRateLines plan={plan as ElectricityPlan} />
      ) : (
        <GasRateLines plan={plan as GasPlan} />
      )}
      {hikePct != null && (
        <p className="notes muted">{t.hikeDetailNote(supplier, hikePct)}</p>
      )}
      <div className="source">
        {t.sourceLabel}
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
  const { t } = useT();
  return (
    <details className="modelling">
      <summary>{t.modellingSummary}</summary>
      <ul>
        <li>
          <strong>{t.modIncludedBold}</strong>
          {t.modIncludedRest}
        </li>
        <li>
          <strong>{t.modProjectionBold}</strong>
          {t.modProjectionRest}
        </li>
        <li>
          <strong>{t.modDiscountBold}</strong>
          {t.modDiscountRest}
        </li>
        <li>
          <strong>{t.modRuralBold}</strong>
          {t.modRuralRest}
        </li>
        <li>
          <strong>{t.modEvBold}</strong>
          {t.modEvRest}
        </li>
        <li>
          <strong>{t.modFreeDayBold}</strong>
          {t.modFreeDayRest}
        </li>
        <li>
          <strong>{t.modSolarBold}</strong>
          {t.modSolarRest}
        </li>
      </ul>
    </details>
  );
}
