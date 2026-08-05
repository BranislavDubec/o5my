import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageToggle, useI18n } from "@/lib/i18n";

type VerificationState = "loading" | "success" | "error";

function getTokenFromHash() {
  const tokenFromSearch = new URLSearchParams(window.location.search).get("token");
  if (tokenFromSearch) return tokenFromSearch;

  // Backward compatibility for links issued before the query was moved
  // outside the hash route.
  const query = window.location.hash.split("?", 2)[1] || "";
  return new URLSearchParams(query).get("token");
}

export default function VerifyEmail() {
  const [state, setState] = useState<VerificationState>("loading");
  const { t } = useI18n();

  useEffect(() => {
    const token = getTokenFromHash();
    if (!token) {
      setState("error");
      return;
    }

    apiRequest("POST", "/api/auth/verify-email", { token })
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative">
      <LanguageToggle className="absolute top-4 right-4" />
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>{t("auth.verifyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {state === "loading" && (
            <>
              <div className="mx-auto w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">{t("auth.verifying")}</p>
            </>
          )}
          {state === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <p>{t("auth.verifySuccess")}</p>
              <Button asChild className="w-full"><Link href="/login">{t("auth.signIn")}</Link></Button>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p>{t("auth.verifyInvalid")}</p>
              <Button asChild variant="outline" className="w-full"><Link href="/login">{t("auth.backToLogin")}</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
