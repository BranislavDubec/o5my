import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { PwaInstallButton } from "@/components/pwa-install-button";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: t("auth.welcomeBack") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!email) {
      toast({ title: t("auth.enterEmailFirst"), variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification", { email });
      toast({ title: t("auth.resendSent") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.jpg"
            alt="Futbal App"
          />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
          <p className="text-sm text-muted-foreground">{t("auth.loginSubtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("auth.loginTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="meno@example.com"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
                {isLoading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="w-full mt-2"
              disabled={isLoading}
              onClick={resendVerification}
            >
              {t("auth.resendVerification")}
            </Button>
            <p className="text-sm text-muted-foreground text-center mt-4">
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                {t("auth.register")}
              </Link>
            </p>
          </CardContent>
        </Card>

        <PwaInstallButton className="w-full" />
      </div>
    </div>
  );
}
