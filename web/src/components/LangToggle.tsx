import { useT } from "../i18n";

export function LangToggle() {
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
