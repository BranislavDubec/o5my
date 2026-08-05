import type { TermsLanguage } from "@shared/terms";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Terms content language — backed by the global app language so the terms
 * page/gate and the rest of the app stay in sync automatically.
 */
export function useTermsLanguage() {
  const { lang, setLang } = useI18n();
  return { lang: lang as TermsLanguage, change: setLang };
}

export function TermsLanguageToggle({
  lang,
  onChange,
}: {
  lang: TermsLanguage;
  onChange: (lang: TermsLanguage) => void;
}) {
  const options = LANGUAGES as TermsLanguage[];
  return (
    <div
      className="inline-flex items-center rounded-full border bg-muted p-0.5"
      role="group"
      aria-label="Language / Jazyk"
    >
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
            lang === option
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
