import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getResetToken() {
  const tokenFromSearch = new URLSearchParams(window.location.search).get("token");
  if (tokenFromSearch) return tokenFromSearch;
  const query = window.location.hash.split("?", 2)[1] || "";
  return new URLSearchParams(query).get("token") || "";
}

export default function ResetPassword() {
  const { toast } = useToast();
  const [token] = useState(getResetToken);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (password.length < 8) {
      toast({ title: "Heslo musí mať aspoň 8 znakov", variant: "destructive" });
      return;
    }
    if (password !== confirmation) {
      toast({ title: "Heslá sa nezhodujú", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (error) {
      toast({
        title: "Heslo sa nepodarilo zmeniť",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle className="text-lg text-center">Nové heslo</CardTitle></CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p>Odkaz neobsahuje platný token.</p>
              <Button asChild variant="outline" className="w-full"><Link href="/forgot-password">Požiadať o nový odkaz</Link></Button>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <p>Heslo bolo úspešne zmenené.</p>
              <Button asChild className="w-full"><Link href="/login">Prihlásiť sa</Link></Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <KeyRound className="mx-auto h-10 w-10 text-primary" />
              <div className="space-y-2">
                <Label htmlFor="new-password">Nové heslo</Label>
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
                <p className="text-xs text-muted-foreground">Aspoň 8 znakov.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Zopakuj nové heslo</Label>
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
                {isLoading ? "Ukladám..." : "Nastaviť nové heslo"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
