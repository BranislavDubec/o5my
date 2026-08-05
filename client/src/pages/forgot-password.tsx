import { useState } from "react";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export default function ForgotPassword() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (error) {
      toast({
        title: t("auth.forgotFailed"),
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
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.jpg" alt="O5MY Futsal" />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("auth.forgotTitle")}</CardTitle></CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-12 w-12 text-primary" />
                <p className="text-sm">{t("auth.forgotSent", { email })}</p>
                <p className="text-xs text-muted-foreground">{t("auth.linkValid1h")}</p>
                <Button asChild className="w-full"><Link href="/login">{t("auth.backToLogin")}</Link></Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("auth.forgotDescription")}</p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("auth.email")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={inputEvent => setEmail(inputEvent.target.value)}
                    required
                    autoComplete="email"
                    data-testid="input-reset-email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-request-password-reset">
                  {isLoading ? t("auth.sending") : t("auth.sendLink")}
                </Button>
                <Button asChild variant="ghost" className="w-full"><Link href="/login">{t("common.back")}</Link></Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
