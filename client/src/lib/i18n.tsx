import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { dictionaries, type Dict } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export type AppLanguage = "sk" | "cz" | "en";

export const LANGUAGES: AppLanguage[] = ["sk", "cz", "en"];

const STORAGE_KEY = "app-lang";
const LEGACY_KEY = "terms-lang";

type Paths<T, P extends string = ""> = {
  [K in keyof T]: T[K] extends string ? `${P}${K & string}` : Paths<T[K], `${P}${K & string}.`>;
}[keyof T];

export type TranslationKey = Paths<Dict>;

type Vars = Record<string, string | number>;

interface I18nContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: (path: TranslationKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
      return stored === "sk" || stored === "cz" || stored === "en" ? stored : "sk";
    } catch {
      return "sk";
    }
  });

  const setLang = useCallback((next: AppLanguage) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors (private mode etc.)
    }
    setLangState(next);
  }, []);

  const t = useCallback(
    (path: TranslationKey, vars?: Vars) => {
      let value = resolve(dictionaries[lang], path);
      if (typeof value !== "string") value = resolve(dictionaries.sk, path);
      if (typeof value !== "string") return path;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (match, name: string) =>
        vars[name] !== undefined ? String(vars[name]) : match,
      );
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Compact SK/CZ/EN segmented selector. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn("inline-flex items-center rounded-full border bg-muted p-0.5", className)}
    >
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLang(option)}
          className={cn(
            "px-2.5 py-1 text-xs font-semibold rounded-full transition-colors",
            lang === option ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
