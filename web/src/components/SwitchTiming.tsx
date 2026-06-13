import { useT } from "../i18n";
import { addDays, fmtDate } from "../format";

export function SwitchTiming({ contractEnd }: { contractEnd: Date | null }) {
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
