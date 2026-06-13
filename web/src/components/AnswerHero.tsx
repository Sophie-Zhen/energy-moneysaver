import { useT } from "../i18n";
import type { RankedCombo } from "../viewModel";

export function AnswerHero({
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
