import { useT } from "../i18n";
import type { NegotiateTarget } from "../simulator";

export function Negotiate({
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
