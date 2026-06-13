import { useT } from "../i18n";

export function ModellingDisclosure() {
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
