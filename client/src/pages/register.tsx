import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      toast({ title: t("auth.needTerms"), variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: t("auth.passwordTooShort"), variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await register({ firstName, lastName, nickname, email, phone: phone || undefined, password, acceptedTerms: true });
      setRegistrationComplete(true);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification", { email });
      toast({ title: t("auth.resendSentAgain") });
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
          <p className="text-sm text-muted-foreground">{t("auth.registerSubtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("auth.registerTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationComplete ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-12 w-12 text-primary" />
                <p>{t("auth.verificationSent", { email })}</p>
                <p className="text-sm text-muted-foreground">{t("auth.linkValid24h")}</p>
                <Button type="button" variant="outline" className="w-full" onClick={resendVerification} disabled={isLoading}>
                  {isLoading ? t("auth.sending") : t("auth.resendEmail")}
                </Button>
                <Button asChild className="w-full"><Link href="/login">{t("auth.goToLogin")}</Link></Button>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first-name">{t("auth.firstName")}</Label>
                  <Input id="first-name" value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={80} placeholder="Ján" data-testid="input-first-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">{t("auth.lastName")}</Label>
                  <Input id="last-name" value={lastName} onChange={e => setLastName(e.target.value)} required maxLength={80} placeholder="Novák" data-testid="input-last-name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">{t("auth.nickname")}</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  required
                  maxLength={30}
                  placeholder="Napr. Krši"
                  autoComplete="nickname"
                  data-testid="input-nickname"
                />
                <p className="text-xs text-muted-foreground">{t("auth.nicknameHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="meno@example.com" data-testid="input-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth.phone", { optional: t("common.optional") })}</Label>
                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420 123 456 789" data-testid="input-phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" data-testid="input-password" />
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="accepted-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  required
                  data-testid="checkbox-accepted-terms"
                  className="mt-0.5"
                />
                <Label htmlFor="accepted-terms" className="text-sm text-muted-foreground font-normal leading-snug">
                  {t("auth.agreeTermsPrefix")}{" "}
                  <a href="/#/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                    {t("auth.termsLink")}
                  </a>
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
                {isLoading ? t("auth.registering") : t("auth.register")}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground text-center mt-4">
              {t("auth.haveAccount")}{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                {t("auth.signIn")}
              </Link>
            </p>
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
