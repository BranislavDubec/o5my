import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, RefreshCw, Banknote, Clock, CheckCircle2, Landmark, WalletCards, Plus, Minus, Trash2 } from "lucide-react";
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
  paymentIban: string;
  paymentRecipientName: string;
  paymentCurrency: string;
  accountBalance: number | null;
  balanceUpdatedAt: string | null;
}

interface CashTransaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  description: string;
  createdAt: string;
}

interface CashboxSummary {
  balance: number;
  transactions: CashTransaction[];
}

export default function AdminBank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashForm, setCashForm] = useState({ type: "income" as "income" | "expense", amount: "", description: "" });
  const [paymentAccount, setPaymentAccount] = useState({
    paymentIban: "",
    paymentRecipientName: "O5MY Futsal",
    paymentCurrency: "CZK",
  });

  const { data: settings } = useQuery<BankSettings>({
    queryKey: ["/api/bank/settings"],
  });

  useEffect(() => {
    if (!settings) return;
    setPaymentAccount({
      paymentIban: settings.paymentIban || "",
      paymentRecipientName: settings.paymentRecipientName || "O5MY Futsal",
      paymentCurrency: settings.paymentCurrency || "CZK",
    });
  }, [settings]);

  const { data: transactions = [], refetch } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank/transactions"],
  });

  const { data: cashbox } = useQuery<CashboxSummary>({
    queryKey: ["/api/cashbox"],
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

  const savePaymentAccountMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/bank/settings", paymentAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      toast({ title: "Platobný účet uložený" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: `Synchronizované: ${data.synced} transakcií, ${data.matched} spárovaných` });
    },
    onError: (err: any) => toast({ title: "Synchronizácia zlyhala", description: err.message, variant: "destructive" }),
  });

  const cashMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cashbox/transactions", {
      type: cashForm.type,
      amount: Number(cashForm.amount),
      description: cashForm.description,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      toast({ title: cashForm.type === "income" ? "Príjem bol pridaný" : "Výdavok bol pridaný" });
      setCashDialogOpen(false);
      setCashForm({ type: "income", amount: "", description: "" });
    },
    onError: (err: any) => toast({ title: "Pohyb sa nepodarilo uložiť", description: err.message, variant: "destructive" }),
  });

  const deleteCashMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cashbox/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      toast({ title: "Pohyb bol zmazaný" });
    },
    onError: (err: any) => toast({ title: "Pohyb sa nepodarilo zmazať", description: err.message, variant: "destructive" }),
  });

  const openCashDialog = (type: "income" | "expense") => {
    setCashForm({ type, amount: "", description: "" });
    setCashDialogOpen(true);
  };

  const lastSync = settings?.lastSync ? format(new Date(settings.lastSync), "d. MMM yyyy HH:mm", { locale: sk }) : "Nikdy";
  const balanceUpdatedAt = settings?.balanceUpdatedAt
    ? format(new Date(settings.balanceUpdatedAt), "d. MMM yyyy HH:mm", { locale: sk })
    : null;
  const currency = settings?.paymentCurrency || "CZK";
  const formatMoney = (amount: number) => {
    try {
      return new Intl.NumberFormat("sk-SK", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Banková integrácia</h1>
        <p className="text-sm text-muted-foreground mt-1">FIO banka — read-only prístup k transakciám</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Zostatok na bankovom účte</p>
                <p className="text-2xl font-bold mt-1" data-testid="bank-account-balance">
                  {settings?.accountBalance === null || settings?.accountBalance === undefined ? `— ${currency}` : formatMoney(settings.accountBalance)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Landmark className="w-5 h-5" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {balanceUpdatedAt ? `Aktualizované z Fio API: ${balanceUpdatedAt}` : "Zostatok sa doplní pri synchronizácii s Fio API."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Pokladnička · hotovosť</p>
                <p className="text-2xl font-bold mt-1" data-testid="cashbox-balance">
                  {cashbox ? formatMoney(cashbox.balance) : `— ${currency}`}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center"><WalletCards className="w-5 h-5" /></div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => openCashDialog("income")} data-testid="button-cash-income"><Plus className="w-3.5 h-3.5 mr-1" />Príjem</Button>
              <Button size="sm" variant="outline" onClick={() => openCashDialog("expense")} data-testid="button-cash-expense"><Minus className="w-3.5 h-3.5 mr-1" />Výdavok</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><WalletCards className="w-4 h-4" />Pohyby v pokladničke</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!cashbox || cashbox.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">V pokladničke zatiaľ nie sú žiadne pohyby.</p>
          ) : cashbox.transactions.slice(0, 20).map(transaction => (
            <div key={transaction.id} className="flex items-center gap-3 rounded-lg border p-3" data-testid={`cash-transaction-${transaction.id}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${transaction.type === "income" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}>
                {transaction.type === "income" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{transaction.description}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(transaction.createdAt), "d. MMM yyyy HH:mm", { locale: sk })}</p>
              </div>
              <span className={`text-sm font-semibold ${transaction.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                {transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirm("Zmazať tento hotovostný pohyb?") && deleteCashMutation.mutate(transaction.id)} aria-label="Zmazať hotovostný pohyb">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

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

      {/* Payment QR Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="w-4 h-4" />
            Účet pre QR platby
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-iban">IBAN príjemcu</Label>
            <Input
              id="payment-iban"
              value={paymentAccount.paymentIban}
              onChange={event => setPaymentAccount(previous => ({ ...previous, paymentIban: event.target.value }))}
              placeholder="CZ65 0800 0000 1920 0014 5399"
              autoCapitalize="characters"
              data-testid="input-payment-iban"
            />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="payment-recipient">Názov príjemcu</Label>
              <Input
                id="payment-recipient"
                value={paymentAccount.paymentRecipientName}
                onChange={event => setPaymentAccount(previous => ({ ...previous, paymentRecipientName: event.target.value }))}
                data-testid="input-payment-recipient"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-currency">Mena</Label>
              <Input
                id="payment-currency"
                value={paymentAccount.paymentCurrency}
                onChange={event => setPaymentAccount(previous => ({ ...previous, paymentCurrency: event.target.value.toUpperCase() }))}
                maxLength={3}
                data-testid="input-payment-currency"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            IBAN a mena sa doplnia aj automaticky pri synchronizácii s FIO. Použijú sa v QR kóde každej platby.
          </p>
          <Button
            onClick={() => savePaymentAccountMutation.mutate()}
            disabled={!paymentAccount.paymentIban || savePaymentAccountMutation.isPending}
            data-testid="button-save-payment-account"
          >
            {savePaymentAccountMutation.isPending ? "Ukladám..." : "Uložiť platobný účet"}
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

      <Dialog open={cashDialogOpen} onOpenChange={open => {
        setCashDialogOpen(open);
        if (!open) setCashForm({ type: "income", amount: "", description: "" });
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nový pohyb v pokladničke</DialogTitle></DialogHeader>
          <form onSubmit={event => { event.preventDefault(); cashMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Typ pohybu</Label>
              <Select value={cashForm.type} onValueChange={value => setCashForm(previous => ({ ...previous, type: value as "income" | "expense" }))}>
                <SelectTrigger data-testid="select-cash-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Príjem do pokladničky</SelectItem>
                  <SelectItem value="expense">Výdavok z pokladničky</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-amount">Suma v {currency}</Label>
              <Input id="cash-amount" type="number" min="1" step="1" value={cashForm.amount} onChange={event => setCashForm(previous => ({ ...previous, amount: event.target.value }))} required data-testid="input-cash-amount" />
              {cashForm.type === "expense" && cashbox && <p className="text-xs text-muted-foreground">Dostupná hotovosť: {formatMoney(cashbox.balance)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-description">Popis</Label>
              <Input id="cash-description" value={cashForm.description} onChange={event => setCashForm(previous => ({ ...previous, description: event.target.value }))} maxLength={200} placeholder="Napr. výber za tréning" required data-testid="input-cash-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCashDialogOpen(false)}>Zrušiť</Button>
              <Button type="submit" disabled={cashMutation.isPending || !cashForm.amount || !cashForm.description.trim()} data-testid="button-save-cash-transaction">
                {cashMutation.isPending ? "Ukladám…" : "Uložiť pohyb"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
