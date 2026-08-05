import { TERMS_INTRO, TERMS_SECTIONS, TERMS_VERSION } from "@shared/terms";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";

export default function TermsPage() {
  const { user } = useAuth();
  const backHref = user ? "/" : "/register";
  const backLabel = user ? "Späť do aplikácie" : "Späť na registráciu";

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 bg-background">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.jpg" alt="O5MY" className="w-16 h-16 rounded-full object-cover" />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
          <p className="text-sm text-muted-foreground">
            Podmienky používania · verzia {TERMS_VERSION}
          </p>
          <p className="text-sm italic text-muted-foreground bg-muted rounded-lg px-4 py-3 max-w-xl">
            {TERMS_INTRO}
          </p>
        </div>

        <Card>
          <CardContent className="py-6 space-y-6">
            {TERMS_SECTIONS.map((section) => (
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
