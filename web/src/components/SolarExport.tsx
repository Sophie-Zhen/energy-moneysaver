import { useT } from "../i18n";
import { exportRevenue } from "../domain/simulator";
import type { ExportRate } from "../domain/types";
import type { Mode, RankedCombo } from "../viewModel";

export function SolarExport({
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
