import {
  TERMS_INTRO,
  TERMS_INTRO_CZ,
  TERMS_INTRO_EN,
  TERMS_SECTIONS,
  TERMS_SECTIONS_CZ,
  TERMS_SECTIONS_EN,
  TERMS_VERSION,
} from "@shared/terms";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { TermsLanguageToggle, useTermsLanguage } from "@/lib/terms-language";

export default function TermsPage() {
  const { user } = useAuth();
  const { lang, change } = useTermsLanguage();
  const backHref = user ? "/" : "/register";
  const backLabel = user ? "Späť do aplikácie" : "Späť na registráciu";
  const intro =
    lang === "en" ? TERMS_INTRO_EN : lang === "cz" ? TERMS_INTRO_CZ : TERMS_INTRO;
  const sections =
    lang === "en"
      ? TERMS_SECTIONS_EN
      : lang === "cz"
        ? TERMS_SECTIONS_CZ
        : TERMS_SECTIONS;
  const title =
    lang === "en"
      ? "Terms of Service"
      : lang === "cz"
        ? "Podmínky používání"
        : "Podmienky používania";
  const versionLabel = lang === "en" ? "version" : lang === "cz" ? "verze" : "verzia";

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 bg-background">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.jpg" alt="O5MY" className="w-16 h-16 rounded-full object-cover" />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
          <p className="text-sm text-muted-foreground">
            {title} · {versionLabel} {TERMS_VERSION}
          </p>
          <TermsLanguageToggle lang={lang} onChange={change} />
          <p className="text-sm italic text-muted-foreground bg-muted rounded-lg px-4 py-3 max-w-xl">
            {intro}
          </p>
        </div>

        <Card>
          <CardContent className="py-6 space-y-6">
            {sections.map((section) => (
              <section key={section.title} className="space-y-2">
                <h2 className="text-base font-semibold">{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-center pb-4">
          <Link href={backHref}>
            <Button variant="outline">{backLabel}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
