import { useT } from "../i18n";
import type { UsageBandSplit } from "../domain/simulator";
import type { Mode } from "../viewModel";

export function WhyCheapest({
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
