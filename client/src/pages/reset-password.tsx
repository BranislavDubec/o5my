import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useI18n } from "@/lib/i18n";

function getResetToken() {
  const tokenFromSearch = new URLSearchParams(window.location.search).get("token");
  if (tokenFromSearch) return tokenFromSearch;
  const query = window.location.hash.split("?", 2)[1] || "";
  return new URLSearchParams(query).get("token") || "";
}

export default function ResetPassword() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [token] = useState(getResetToken);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (password.length < 8) {
      toast({ title: t("auth.passwordTooShort"), variant: "destructive" });
      return;
    }
    if (password !== confirmation) {
      toast({ title: t("auth.passwordsMismatch"), variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (error) {
      toast({
        title: t("auth.resetFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative">
      <LanguageToggle className="absolute top-4 right-4" />
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle className="text-lg text-center">{t("auth.resetTitle")}</CardTitle></CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p>{t("auth.invalidToken")}</p>
              <Button asChild variant="outline" className="w-full"><Link href="/forgot-password">{t("auth.requestNewLink")}</Link></Button>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <p>{t("auth.resetSuccess")}</p>
              <Button asChild className="w-full"><Link href="/login">{t("auth.signIn")}</Link></Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <KeyRound className="mx-auto h-10 w-10 text-primary" />
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("auth.resetTitle")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={inputEvent => setPassword(inputEvent.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-new-password"
                />
                <p className="text-xs text-muted-foreground">{t("auth.minChars")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmation}
                  onChange={inputEvent => setConfirmation(inputEvent.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-reset-password">
                {isLoading ? t("common.saving") : t("auth.setNewPassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
