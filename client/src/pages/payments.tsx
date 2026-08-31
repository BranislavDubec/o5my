import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle, ChevronRight, WalletCards } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";

interface Payment {
  id: number;
  amount: number;
  walletAppliedAmount: number;
  dueDate: string;
  variableSymbol: string | null;
  description: string;
  status: string;
}

function getOutstandingAmount(payment: Payment) {
  return Math.max(0, payment.amount - payment.walletAppliedAmount);
}

interface WalletSummary {
  balance: number;
  currency: string;
  updatedAt: string | null;
  transactions: Array<{
    id: number;
    amount: number;
    description: string;
    createdAt: string;
  }>;
}

function formatWalletBalance(balance: number, currency: string, localeTag: string) {
  try {
    return new Intl.NumberFormat(localeTag, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(balance);
  } catch {
    return `${balance} ${currency}`;
  }
}

export default function PaymentsPage() {
  const { lang, t } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const localeTag = lang === "cz" ? "cs-CZ" : lang === "en" ? "en-US" : "sk-SK";
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });
  const { data: wallet, isLoading: walletIsLoading, isError: walletHasError } = useQuery<WalletSummary>({
    queryKey: ["/api/wallet"],
  });

  const totalPaid = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + getOutstandingAmount(p), 0);
  const totalOverdue = payments.filter(p => p.status === "overdue").reduce((sum, p) => sum + getOutstandingAmount(p), 0);

  const statusConfig = {
    paid: { label: t("payments.paid"), variant: "default" as const, icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
    pending: { label: t("payments.pending"), variant: "secondary" as const, icon: Clock, color: "text-yellow-600 dark:text-yellow-400" },
    overdue: { label: t("payments.overdue"), variant: "destructive" as const, icon: AlertCircle, color: "text-red-600 dark:text-red-400" },
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("layout.payments")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("payments.subtitle")}</p>
      </div>

      <Card className="border-primary/40 bg-primary/5" data-testid="card-wallet">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <WalletCards className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("payments.myWallet")}</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-wallet-balance">
              {walletIsLoading
                ? t("common.loading")
                : walletHasError || !wallet
                  ? t("payments.unavailable")
                  : formatWalletBalance(wallet.balance, wallet.currency, localeTag)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {walletHasError
                ? t("payments.balanceLoadFailed")
                : t("payments.readOnlyHint")}
            </p>
          </div>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{t("payments.readOnly")}</Badge>
        </CardContent>
      </Card>

      {wallet && wallet.transactions.length > 0 && (
        <Card data-testid="card-wallet-history">
          <CardHeader>
            <CardTitle className="text-base">{t("payments.walletHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallet.transactions.slice(0, 10).map(transaction => (
              <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{transaction.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(parseISO(transaction.createdAt), "d. MMM yyyy HH:mm", { locale: dateLocale })}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${transaction.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {transaction.amount > 0 ? "+" : ""}{transaction.amount} {wallet.currency}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("payments.paid")}</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400" data-testid="text-paid-amount">{totalPaid} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("payments.pending")}</p>
            <p className="text-base font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-pending-amount">{totalPending} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("payments.overdue")}</p>
            <p className="text-base font-bold text-red-600 dark:text-red-400" data-testid="text-overdue-amount">{totalOverdue} Kč</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment List */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("payments.none")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map(payment => {
            const cfg = statusConfig[payment.status as keyof typeof statusConfig] || statusConfig.pending;
            const Icon = cfg.icon;
            const outstandingAmount = getOutstandingAmount(payment);
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
                        {payment.walletAppliedAmount > 0 && (
                          <span className="text-green-700 dark:text-green-400">
                            {t("payments.fromWallet", { amount: payment.walletAppliedAmount })}
                          </span>
                        )}
                        {payment.walletAppliedAmount > 0 && outstandingAmount > 0 && (
                          <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                            {t("payments.remaining", { amount: outstandingAmount })}
                          </span>
                        )}
                        <span>{t("payments.due", { date: format(parseISO(payment.dueDate), "d. MMM yyyy", { locale: dateLocale }) })}</span>
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
            {t("payments.walletExplain")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
