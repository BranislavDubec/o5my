import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type VerificationState = "loading" | "success" | "error";

function getTokenFromHash() {
  const query = window.location.hash.split("?", 2)[1] || "";
  return new URLSearchParams(query).get("token");
}

export default function VerifyEmail() {
  const [state, setState] = useState<VerificationState>("loading");

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Potvrdenie emailu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {state === "loading" && (
            <>
              <div className="mx-auto w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Overujem odkaz…</p>
            </>
          )}
          {state === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <p>Email bol potvrdený. Teraz sa môžeš prihlásiť.</p>
              <Button asChild className="w-full"><Link href="/login">Prihlásiť sa</Link></Button>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p>Odkaz je neplatný alebo expirovaný.</p>
              <Button asChild variant="outline" className="w-full"><Link href="/login">Späť na prihlásenie</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
