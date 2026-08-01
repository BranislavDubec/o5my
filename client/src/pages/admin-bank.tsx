import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, RefreshCw, Banknote, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";

interface BankTransaction {
  id: number;
  transactionId: string;
  amount: number;
  date: string;
  payerName: string | null;
  payerIban: string | null;
  variableSymbol: string | null;
  memo: string | null;
  matchedPaymentId: number | null;
}

interface BankSettings {
  hasToken: boolean;
  lastSync: string | null;
}

export default function AdminBank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");

  const { data: settings } = useQuery<BankSettings>({
    queryKey: ["/api/bank/settings"],
  });

  const { data: transactions = [], refetch } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank/transactions"],
  });

  const saveTokenMutation = useMutation({
    mutationFn: (fioToken: string) => apiRequest("PUT", "/api/bank/settings", { fioToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      toast({ title: "Token uložený" });
      setToken("");
    },
    onError: (err: any) => toast({ title: "Chyba", description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bank/sync", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/bank/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      toast({ title: `Synchronizované: ${data.synced} transakcií, ${data.matched} spárovaných` });
    },
    onError: (err: any) => toast({ title: "Synchronizácia zlyhala", description: err.message, variant: "destructive" }),
  });

  const lastSync = settings?.lastSync ? format(new Date(settings.lastSync), "d. MMM yyyy HH:mm", { locale: sk }) : "Nikdy";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Banková integrácia</h1>
        <p className="text-sm text-muted-foreground mt-1">FIO banka — read-only prístup k transakciám</p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${settings?.hasToken ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">FIO API Token</p>
              <p className="text-xs text-muted-foreground">
                {settings?.hasToken ? "Aktívny" : "Nenastavený"}
              </p>
            </div>
            <Badge variant={settings?.hasToken ? "default" : "secondary"} data-testid="badge-token-status">
              {settings?.hasToken ? "Pripojené" : "Nepripojené"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Posledná synchronizácia: {lastSync}
          </div>
        </CardContent>
      </Card>

      {/* Token Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nastaviť FIO API Token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">API Token</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="64-znakový token z Internetbankingu"
              data-testid="input-fio-token"
            />
            <p className="text-xs text-muted-foreground">
              Token vygeneruješ v Internetbankingu → Nastavení → API. Token je platný 180 dní, obnovuje sa pri každom prihlásení do Internetbankingu.
            </p>
          </div>
          <Button
            onClick={() => saveTokenMutation.mutate(token)}
            disabled={!token || saveTokenMutation.isPending}
            data-testid="button-save-token"
          >
            {saveTokenMutation.isPending ? "Ukladám..." : "Uložiť token"}
          </Button>
        </CardContent>
      </Card>

      {/* Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Synchronizácia transakcií</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={!settings?.hasToken || syncMutation.isPending}
            data-testid="button-sync"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Synchronizujem..." : "Synchronizovať"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Stiahne nové transakcie z FIO banky a automaticky spáruje ich s čakajúcimi platbami podľa variabilného symbolu.
          </p>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Posledné transakcie ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Žiadne transakcie. Spusti synchronizáciu.</p>
          ) : (
            transactions.slice(0, 20).map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg border border-border" data-testid={`card-tx-${tx.id}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.matchedPaymentId ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {tx.matchedPaymentId ? <CheckCircle2 className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{tx.amount} Kč</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tx.payerName || "Neznámy plátca"}
                    {tx.variableSymbol && ` · VS: ${tx.variableSymbol}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(tx.date), "d. MMM yyyy", { locale: sk })}</p>
                </div>
                {tx.matchedPaymentId ? (
                  <Badge variant="default" className="bg-green-600 text-xs">Spárované</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Nespárované</Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
