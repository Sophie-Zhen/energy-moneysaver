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
import type { HourlySeries, MeterType } from "./types";

type Mode = "form" | "hdf";
type RankedCombo = { combo: Combo; annualEur: number; hiked: boolean };
type ComboBreakdown = { elec: ElectricityBreakdown; gas: GasBreakdown | null };

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

        const annualEur = gas
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
        return { combo: projectedCombo, annualEur, hiked };
      })
      .sort((a, b) => a.annualEur - b.annualEur);
  }, [snapshot, series, hasGas, annualGasKwh, hasEv, annualEvKwh, meterType, referenceDate]);

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
      };
    };
    const best = ranking[0].combo;
    const cur =
      ranking.find((r) => r.combo.id === currentComboId)?.combo ?? null;
    return {
      bestCombo: best,
      best: mk(best),
      curCombo: cur,
      cur: cur ? mk(cur) : null,
    };
  }, [ranking, series, currentComboId, hasEv, annualEvKwh, annualGasKwh]);

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
    const total = (b: ComboBreakdown) => b.elec.totalEur + (b.gas?.totalEur ?? 0);
    const units =
      cur.elec.nightEur +
      cur.elec.dayEur +
      cur.elec.peakEur +
      (cur.gas?.unitsEur ?? 0);
    const fixed =
      cur.elec.standingEur +
      cur.elec.psoLevyEur -
      cur.elec.welcomeCreditEur +
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
    { label: "Total", v: e.totalEur + (g?.totalEur ?? 0), isTotal: true },
  ];
}

function eur(v: number): string {
  return v < 0 ? `−€${Math.abs(v).toFixed(0)}` : `€${v.toFixed(0)}`;
}

function ComboRates({ combo }: { combo: Combo }) {
  return (
    <div className="drawer">
      <PlanDetail
        title={`Electricity: ${combo.elec.supplier}`}
        label={combo.elec.label}
        source={combo.elec.source}
        notes={combo.elec.notes}
      />
      {combo.gas && (
        <PlanDetail
          title={`Gas: ${combo.gas.supplier}`}
          label={combo.gas.label}
          source={combo.gas.source}
          notes={combo.gas.notes}
        />
      )}
    </div>
  );
}

function CostBreakdown({
  bestCombo,
  best,
  curCombo,
  cur,
}: {
  bestCombo: Combo;
  best: ComboBreakdown;
  curCombo: Combo | null;
  cur: ComboBreakdown | null;
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
        <ComboRates combo={bestCombo} />
        {curCombo && (
          <>
            <h3 className="rates-heading">Current: {curLabel}</h3>
            <ComboRates combo={curCombo} />
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
            <div className="drawer">
              <PlanDetail
                title={`Electricity: ${combo.elec.supplier}`}
                label={combo.elec.label}
                source={combo.elec.source}
                notes={combo.elec.notes}
              />
              {combo.gas && (
                <PlanDetail
                  title={`Gas: ${combo.gas.supplier}`}
                  label={combo.gas.label}
                  source={combo.gas.source}
                  notes={combo.gas.notes}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PlanDetail({
  title,
  label,
  source,
  notes,
}: {
  title: string;
  label: string;
  source: { url: string; verified_on: string; confidence: string };
  notes?: string | null;
}) {
  const href = extractHref(source.url);
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
      </ul>
    </details>
  );
}
