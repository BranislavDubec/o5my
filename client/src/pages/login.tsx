import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PwaInstallButton } from "@/components/pwa-install-button";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: "Vitaj späť!" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!email) {
      toast({ title: "Najprv zadaj email", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification", { email });
      toast({ title: "Ak účet čaká na potvrdenie, poslali sme nový email" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.jpg"
            alt="Futbal App"
          />
          <h1 className="font-serif text-2xl font-bold tracking-tight">O5MY Futsal</h1>
          <p className="text-sm text-muted-foreground">Prihlás sa do tímovej appky</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prihlásenie</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="password">Heslo</Label>
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
                {isLoading ? "Prihlasujem..." : "Prihlásiť"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="w-full mt-2"
              disabled={isLoading}
              onClick={resendVerification}
            >
              Poslať potvrdzovací email znova
            </Button>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Nemáš účet?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                Registrovať
              </Link>
            </p>
          </CardContent>
        </Card>

        <PwaInstallButton className="w-full" />
      </div>
    </div>
  );
}
