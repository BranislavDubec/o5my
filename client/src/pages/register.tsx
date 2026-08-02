import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Heslo musí mať aspoň 6 znakov", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await register({ name, nickname, email, phone: phone || undefined, password });
      setRegistrationComplete(true);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification", { email });
      toast({ title: "Overovací email bol znovu odoslaný" });
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
          <p className="text-sm text-muted-foreground">Vytvor si účet</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registrácia</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationComplete ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-12 w-12 text-primary" />
                <p>Na adresu <strong>{email}</strong> sme poslali potvrdzovací odkaz.</p>
                <p className="text-sm text-muted-foreground">Odkaz platí 24 hodín.</p>
                <Button type="button" variant="outline" className="w-full" onClick={resendVerification} disabled={isLoading}>
                  {isLoading ? "Odosielam…" : "Poslať email znova"}
                </Button>
                <Button asChild className="w-full"><Link href="/login">Prejsť na prihlásenie</Link></Button>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Meno a priezvisko</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="Ján Novák" data-testid="input-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">Prezývka</Label>
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
                <p className="text-xs text-muted-foreground">Meno, pod ktorým ťa pozná tím.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="meno@example.com" data-testid="input-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefón (voliteľné)</Label>
                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420 123 456 789" data-testid="input-phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} data-testid="input-password" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
                {isLoading ? "Registrujem..." : "Registrovať"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Máš už účet?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Prihlásiť
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
