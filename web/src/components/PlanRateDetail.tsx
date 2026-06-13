import { useT } from "../i18n";
import { extractHref, fmtHour } from "../format";
import type { ElectricityPlan, GasPlan } from "../domain/types";
import type { RankedCombo } from "../viewModel";

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

// The verified catalogue rates (pre-hike) behind a combo, so a user can check
// each number against the linked source. Uses `orig`, not the projected plans,
// because the source page shows today's published rate; any announced increase
// is noted separately and applied only in the modelled cost.
export function ComboRateDetail({ ranked }: { ranked: RankedCombo }) {
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
