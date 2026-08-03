import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle, ChevronRight, WalletCards } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";

interface Payment {
  id: number;
  amount: number;
  dueDate: string;
  variableSymbol: string | null;
  description: string;
  status: string;
}

interface WalletSummary {
  balance: number;
  currency: string;
  updatedAt: string | null;
}

function formatWalletBalance(balance: number, currency: string) {
  try {
    return new Intl.NumberFormat("sk-SK", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(balance);
  } catch {
    return `${balance} ${currency}`;
  }
}

export default function PaymentsPage() {
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });
  const { data: wallet, isLoading: walletIsLoading, isError: walletHasError } = useQuery<WalletSummary>({
    queryKey: ["/api/wallet"],
  });

  const totalPaid = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const totalOverdue = payments.filter(p => p.status === "overdue").reduce((sum, p) => sum + p.amount, 0);

  const statusConfig = {
    paid: { label: "Zaplatené", variant: "default" as const, icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
    pending: { label: "Čaká", variant: "secondary" as const, icon: Clock, color: "text-yellow-600 dark:text-yellow-400" },
    overdue: { label: "Po termíne", variant: "destructive" as const, icon: AlertCircle, color: "text-red-600 dark:text-red-400" },
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Platby</h1>
        <p className="text-sm text-muted-foreground mt-1">Tvoj platobný prehľad</p>
      </div>

      <Card className="border-primary/40 bg-primary/5" data-testid="card-wallet">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <WalletCards className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tvoja peňaženka</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-wallet-balance">
              {walletIsLoading
                ? "Načítavam..."
                : walletHasError || !wallet
                  ? "Nedostupné"
                  : formatWalletBalance(wallet.balance, wallet.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {walletHasError
                ? "Zostatok sa nepodarilo načítať. Skús obnoviť stránku."
                : "Zostatok je len na čítanie a neskôr sa bude aktualizovať synchronizáciou s bankou."}
            </p>
          </div>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">Len na čítanie</Badge>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Zaplatené</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400" data-testid="text-paid-amount">{totalPaid} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Čaká</p>
            <p className="text-base font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-pending-amount">{totalPending} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Po termíne</p>
            <p className="text-base font-bold text-red-600 dark:text-red-400" data-testid="text-overdue-amount">{totalOverdue} Kč</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment List */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Žiadne platby</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map(payment => {
            const cfg = statusConfig[payment.status as keyof typeof statusConfig] || statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <Link key={payment.id} href={`/payments/${payment.id}`}>
                <Card className="cursor-pointer transition-colors hover:border-primary/50" data-testid={`card-payment-${payment.id}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-muted ${cfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{payment.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="font-semibold text-foreground">{payment.amount} Kč</span>
                        <span>Splatnosť: {format(parseISO(payment.dueDate), "d. MMM yyyy", { locale: sk })}</span>
                        {payment.variableSymbol && <span>VS: {payment.variableSymbol}</span>}
                      </div>
                    </div>
                    <Badge variant={cfg.variant} data-testid={`badge-payment-status-${payment.id}`}>{cfg.label}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Platby sa vykonávajú samostatne prevodom na tímový účet. Tu vidíš len prehľad svojich platieb a ich stav.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
