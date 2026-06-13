import { useT, type Strings } from "../i18n";
import { eur } from "../format";
import type { Combo } from "../planner";
import type { ComboBreakdown, RankedCombo } from "../viewModel";
import { ComboRateDetail } from "./PlanRateDetail";

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

export function CostBreakdown({
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
