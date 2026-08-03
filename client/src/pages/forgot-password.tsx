import { useState } from "react";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const { toast } = useToast();
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
        title: "Žiadosť sa nepodarilo odoslať",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.jpg" alt="O5MY Futsal" />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-lg">Obnovenie hesla</CardTitle></CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-12 w-12 text-primary" />
                <p className="text-sm">Ak účet s adresou <strong>{email}</strong> existuje, poslali sme naň odkaz na vytvorenie nového hesla.</p>
                <p className="text-xs text-muted-foreground">Odkaz je platný jednu hodinu. Skontroluj aj priečinok Spam.</p>
                <Button asChild className="w-full"><Link href="/login">Späť na prihlásenie</Link></Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">Zadaj email používaný v aplikácii a pošleme ti bezpečný odkaz na obnovenie hesla.</p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
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
                  {isLoading ? "Odosielam..." : "Poslať odkaz"}
                </Button>
                <Button asChild variant="ghost" className="w-full"><Link href="/login">Späť</Link></Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
