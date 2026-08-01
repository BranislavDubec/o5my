import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Heslo musí mať aspoň 6 znakov", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await register({ name, email, phone: phone || undefined, password });
      toast({ title: "Vitaj v tíme!" });
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
          <svg viewBox="0 0 32 32" className="w-16 h-16" fill="none">
            <circle cx="16" cy="16" r="14" fill="hsl(var(--primary))" />
            <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" />
            <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(72 16 16)" />
            <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(144 16 16)" />
            <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(216 16 16)" />
            <path d="M16 6 L19 10 L17 15 L15 15 L13 10 Z" fill="white" fillOpacity="0.9" transform="rotate(288 16 16)" />
          </svg>
          <h1 className="font-serif text-2xl font-bold tracking-tight">Futbal Tím</h1>
          <p className="text-sm text-muted-foreground">Vytvor si účet</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registrácia</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Meno a priezvisko</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="Ján Novák" data-testid="input-name" />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
