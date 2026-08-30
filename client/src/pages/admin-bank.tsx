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
import { Shield, RefreshCw, Banknote, Clock, CheckCircle2, Landmark, WalletCards, Plus, Minus, Trash2, Link2 } from "lucide-react";
import { format } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";

interface BankTransaction {
  id: number;
  transactionId: string;
  amount: number; // minor units
  currency: string;
  date: string;
  payerName: string | null;
  payerAccount: string | null;
  payerBankCode: string | null;
  payerIban: string | null;
  variableSymbol: string | null;
  memo: string | null;
  syncError: string | null;
  matchedPaymentId: number | null;
  reconciledUserId: number | null;
  reconciledAt: string | null;
}

interface BankUser {
  id: number;
  name: string;
  isActive: boolean;
  emailVerified: boolean;
  walletBalance: number;
}

interface BankPayment {
  id: number;
  userId: number;
  amount: number;
  walletAppliedAmount: number;
  status: string;
  description: string;
  dueDate: string;
  variableSymbol: string | null;
}

type TransactionFilter = "processing" | "matched" | "wallet" | "errors" | "all";

interface BankSettings {
  hasToken: boolean;
  lastSync: string | null;
  paymentIban: string;
  paymentRecipientName: string;
  paymentCurrency: string;
  accountBalance: number | null;
  balanceUpdatedAt: string | null;
  lastSyncError: string | null;
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
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashForm, setCashForm] = useState({ type: "income" as "income" | "expense", amount: "", description: "" });
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("processing");
  const [resolvingTransaction, setResolvingTransaction] = useState<BankTransaction | null>(null);
  const [resolutionUserId, setResolutionUserId] = useState("");
  const [resolutionTarget, setResolutionTarget] = useState("wallet");
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

  const { data: transactions = [] } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank/transactions"],
  });

  const { data: users = [] } = useQuery<BankUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: payments = [] } = useQuery<BankPayment[]>({
    queryKey: ["/api/payments/all"],
  });

  const { data: cashbox } = useQuery<CashboxSummary>({
    queryKey: ["/api/cashbox"],
  });

  const saveTokenMutation = useMutation({
    mutationFn: (fioToken: string) => apiRequest("PUT", "/api/bank/settings", { fioToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      toast({ title: t("adminBank.tokenSaved") });
      setToken("");
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const savePaymentAccountMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/bank/settings", paymentAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      toast({ title: t("adminBank.accountSaved") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
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
      toast({ title: t("adminBank.syncResult", { synced: data.synced, matched: data.matched }) });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/settings"] });
      toast({ title: t("adminBank.syncFailed"), description: err.message, variant: "destructive" });
    },
  });

  const invalidateReconciliationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bank/transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  };

  const reconcileMutation = useMutation({
    mutationFn: async ({ transactionId, userId, paymentId }: { transactionId: number; userId: number; paymentId: number | null }) => {
      const response = await apiRequest("POST", `/api/bank/transactions/${transactionId}/reconcile`, { userId, paymentId });
      return response.json() as Promise<{ walletCredit: number }>;
    },
    onSuccess: result => {
      invalidateReconciliationQueries();
      toast({
        title: t("adminBank.reconciliationSaved"),
        description: result.walletCredit > 0 ? t("adminBank.walletCredited", { amount: result.walletCredit }) : undefined,
      });
      setResolvingTransaction(null);
      setResolutionUserId("");
      setResolutionTarget("wallet");
    },
    onError: (err: any) => toast({ title: t("adminBank.reconciliationFailed"), description: err.message, variant: "destructive" }),
  });

  const retryMatchingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bank/transactions/retry-matching", {});
      return response.json() as Promise<{ matched?: number }>;
    },
    onSuccess: result => {
      invalidateReconciliationQueries();
      toast({ title: t("adminBank.retryResult", { matched: result.matched ?? 0 }) });
    },
    onError: (err: any) => toast({ title: t("adminBank.retryFailed"), description: err.message, variant: "destructive" }),
  });

  const cashMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cashbox/transactions", {
      type: cashForm.type,
      amount: Number(cashForm.amount),
      description: cashForm.description,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      toast({ title: cashForm.type === "income" ? t("adminBank.incomeAdded") : t("adminBank.expenseAdded") });
      setCashDialogOpen(false);
      setCashForm({ type: "income", amount: "", description: "" });
    },
    onError: (err: any) => toast({ title: t("adminBank.movementSaveFailed"), description: err.message, variant: "destructive" }),
  });

  const deleteCashMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cashbox/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cashbox"] });
      toast({ title: t("adminBank.movementDeleted") });
    },
    onError: (err: any) => toast({ title: t("adminBank.movementDeleteFailed"), description: err.message, variant: "destructive" }),
  });

  const openCashDialog = (type: "income" | "expense") => {
    setCashForm({ type, amount: "", description: "" });
    setCashDialogOpen(true);
  };

  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const localeTag = lang === "cz" ? "cs-CZ" : lang === "en" ? "en-US" : "sk-SK";
  const lastSync = settings?.lastSync ? format(new Date(settings.lastSync), "d. MMM yyyy HH:mm", { locale: dateLocale }) : t("adminBank.never");
  const balanceUpdatedAt = settings?.balanceUpdatedAt
    ? format(new Date(settings.balanceUpdatedAt), "d. MMM yyyy HH:mm", { locale: dateLocale })
    : null;
  const currency = settings?.paymentCurrency || "CZK";
  const formatMoney = (amount: number) => {
    try {
      return new Intl.NumberFormat(localeTag, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };
  const formatTransactionMoney = (amountMinor: number, transactionCurrency: string) => {
    try {
      return new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency: transactionCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amountMinor / 100);
    } catch {
      return `${(amountMinor / 100).toFixed(2)} ${transactionCurrency}`;
    }
  };
  const transactionError = (error: string) => {
    switch (error) {
      case "unsupported_currency": return t("adminBank.unsupportedCurrency");
      case "amount_mismatch": return t("adminBank.amountMismatch");
      default: return t("adminBank.transactionError");
    }
  };
  const isReconciledTransaction = (transaction: BankTransaction) => !!transaction.reconciledAt || !!transaction.reconciledUserId;
  const isActionableTransaction = (transaction: BankTransaction) => (
    transaction.amount > 0
    && transaction.currency.toUpperCase() === "CZK"
    && !transaction.matchedPaymentId
    && !isReconciledTransaction(transaction)
    && (!transaction.syncError || transaction.syncError === "amount_mismatch")
  );
  const filteredTransactions = transactions.filter(transaction => {
    switch (transactionFilter) {
      case "processing": return isActionableTransaction(transaction);
      case "matched": return !!transaction.matchedPaymentId;
      case "wallet": return isReconciledTransaction(transaction) && !transaction.matchedPaymentId;
      case "errors": return !!transaction.syncError;
      default: return true;
    }
  });
  const visibleTransactions = transactionFilter === "processing"
    ? filteredTransactions
    : filteredTransactions.slice(0, 20);
  const sortedUsers = users
    .filter(user => user.isActive && user.emailVerified)
    .sort((a, b) => a.name.localeCompare(b.name, localeTag));
  const eligiblePayments = payments
    .filter(payment => (
      payment.userId === Number(resolutionUserId)
      && payment.status !== "paid"
      && payment.amount - payment.walletAppliedAmount > 0
    ))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const selectedPaymentId = resolutionTarget.startsWith("payment:")
    ? Number(resolutionTarget.slice("payment:".length))
    : null;
  const selectedPayment = selectedPaymentId === null
    ? null
    : eligiblePayments.find(payment => payment.id === selectedPaymentId) ?? null;
  const selectedUser = users.find(user => user.id === Number(resolutionUserId)) ?? null;
  const receivedMinor = resolvingTransaction?.amount ?? 0;
  const paymentAllocationMinor = selectedPayment
    ? Math.round((selectedPayment.amount - selectedPayment.walletAppliedAmount) * 100)
    : 0;
  const walletCreditMinor = resolutionTarget === "wallet"
    ? receivedMinor
    : receivedMinor - paymentAllocationMinor;
  const isUnderpayment = !!selectedPayment && receivedMinor < paymentAllocationMinor;
  const hasFractionalWalletCredit = walletCreditMinor > 0 && walletCreditMinor % 100 !== 0;
  const canReconcile = !!resolvingTransaction
    && !!resolutionUserId
    && (resolutionTarget === "wallet" || !!selectedPayment)
    && !isUnderpayment
    && walletCreditMinor >= 0
    && !hasFractionalWalletCredit;

  const openReconciliation = (transaction: BankTransaction) => {
    setResolvingTransaction(transaction);
    setResolutionUserId("");
    setResolutionTarget("wallet");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("adminBank.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("adminBank.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t("adminBank.accountBalance")}</p>
                <p className="text-2xl font-bold mt-1" data-testid="bank-account-balance">
                  {settings?.accountBalance === null || settings?.accountBalance === undefined ? `— ${currency}` : formatMoney(settings.accountBalance)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Landmark className="w-5 h-5" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {balanceUpdatedAt ? t("adminBank.balanceUpdated", { time: balanceUpdatedAt }) : t("adminBank.balanceNotUpdated")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t("adminBank.cashboxLabel")}</p>
                <p className="text-2xl font-bold mt-1" data-testid="cashbox-balance">
                  {cashbox ? formatMoney(cashbox.balance) : `— ${currency}`}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center"><WalletCards className="w-5 h-5" /></div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => openCashDialog("income")} data-testid="button-cash-income"><Plus className="w-3.5 h-3.5 mr-1" />{t("adminBank.income")}</Button>
              <Button size="sm" variant="outline" onClick={() => openCashDialog("expense")} data-testid="button-cash-expense"><Minus className="w-3.5 h-3.5 mr-1" />{t("adminBank.expense")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><WalletCards className="w-4 h-4" />{t("adminBank.cashboxTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!cashbox || cashbox.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("adminBank.cashboxEmpty")}</p>
          ) : cashbox.transactions.slice(0, 20).map(transaction => (
            <div key={transaction.id} className="flex items-center gap-3 rounded-lg border p-3" data-testid={`cash-transaction-${transaction.id}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${transaction.type === "income" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}>
                {transaction.type === "income" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{transaction.description}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(transaction.createdAt), "d. MMM yyyy HH:mm", { locale: dateLocale })}</p>
              </div>
              <span className={`text-sm font-semibold ${transaction.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                {transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirm(t("adminBank.deleteMovementConfirm")) && deleteCashMutation.mutate(transaction.id)} aria-label={t("adminBank.deleteMovementAria")}>
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
              <p className="text-sm font-medium">{t("adminBank.tokenLabel")}</p>
              <p className="text-xs text-muted-foreground">
                {settings?.hasToken ? t("adminBank.tokenActive") : t("adminBank.tokenNotSet")}
              </p>
            </div>
            <Badge variant={settings?.hasToken ? "default" : "secondary"} data-testid="badge-token-status">
              {settings?.hasToken ? t("adminBank.connected") : t("adminBank.notConnected")}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {t("adminBank.lastSync", { time: lastSync })}
          </div>
          {settings?.lastSyncError && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive" data-testid="text-fio-sync-error">
              {settings.lastSyncError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Token Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminBank.tokenCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">{t("adminBank.apiToken")}</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={t("adminBank.tokenPlaceholder")}
              data-testid="input-fio-token"
            />
            <p className="text-xs text-muted-foreground">
              {t("adminBank.tokenHint")}
            </p>
          </div>
          <Button
            onClick={() => saveTokenMutation.mutate(token)}
            disabled={!token || saveTokenMutation.isPending}
            data-testid="button-save-token"
          >
            {saveTokenMutation.isPending ? t("common.saving") : t("adminBank.saveToken")}
          </Button>
        </CardContent>
      </Card>

      {/* Payment QR Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="w-4 h-4" />
            {t("adminBank.qrAccountTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-iban">{t("adminBank.recipientIban")}</Label>
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
              <Label htmlFor="payment-recipient">{t("adminBank.recipientName")}</Label>
              <Input
                id="payment-recipient"
                value={paymentAccount.paymentRecipientName}
                onChange={event => setPaymentAccount(previous => ({ ...previous, paymentRecipientName: event.target.value }))}
                data-testid="input-payment-recipient"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-currency">{t("adminBank.currency")}</Label>
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
            {t("adminBank.qrHint")}
          </p>
          <Button
            onClick={() => savePaymentAccountMutation.mutate()}
            disabled={!paymentAccount.paymentIban || savePaymentAccountMutation.isPending}
            data-testid="button-save-payment-account"
          >
            {savePaymentAccountMutation.isPending ? t("common.saving") : t("adminBank.savePaymentAccount")}
          </Button>
        </CardContent>
      </Card>

      {/* Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("adminBank.syncTitle")}</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => retryMatchingMutation.mutate()}
              disabled={retryMatchingMutation.isPending}
              data-testid="button-retry-matching"
            >
              <Link2 className={`w-4 h-4 mr-1 ${retryMatchingMutation.isPending ? "animate-pulse" : ""}`} />
              {retryMatchingMutation.isPending ? t("adminBank.retrying") : t("adminBank.retryMatching")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={!settings?.hasToken || syncMutation.isPending}
              data-testid="button-sync"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? t("adminBank.syncing") : t("adminBank.sync")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t("adminBank.syncHint")}
          </p>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              {t("adminBank.latestTransactions", { count: filteredTransactions.length })}
            </CardTitle>
            <Select value={transactionFilter} onValueChange={value => setTransactionFilter(value as TransactionFilter)}>
              <SelectTrigger className="w-full sm:w-44" data-testid="select-transaction-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="processing">{t("adminBank.filterProcessing")}</SelectItem>
                <SelectItem value="matched">{t("adminBank.filterMatched")}</SelectItem>
                <SelectItem value="wallet">{t("adminBank.filterWallet")}</SelectItem>
                <SelectItem value="errors">{t("adminBank.filterErrors")}</SelectItem>
                <SelectItem value="all">{t("adminBank.filterAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {transactions.length === 0 ? t("adminBank.noTransactions") : t("adminBank.noTransactionsForFilter")}
            </p>
          ) : (
            visibleTransactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg border border-border" data-testid={`card-tx-${tx.id}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.matchedPaymentId ? "bg-green-500/15 text-green-600" : isReconciledTransaction(tx) ? "bg-blue-500/15 text-blue-600" : "bg-muted text-muted-foreground"}`}>
                  {tx.matchedPaymentId ? <CheckCircle2 className="w-4 h-4" /> : isReconciledTransaction(tx) ? <WalletCards className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatTransactionMoney(tx.amount, tx.currency)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tx.payerName || t("adminBank.unknownPayer")}
                    {tx.variableSymbol && ` · VS: ${tx.variableSymbol}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(tx.date), "d. MMM yyyy", { locale: dateLocale })}</p>
                  {tx.syncError && (
                    <p className="mt-1 text-xs font-medium text-destructive" data-testid={`text-tx-error-${tx.id}`}>
                      {transactionError(tx.syncError)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {tx.matchedPaymentId ? (
                    <Badge variant="default" className="bg-green-600 text-xs">{t("adminBank.matched")}</Badge>
                  ) : isReconciledTransaction(tx) ? (
                    <Badge variant="default" className="bg-blue-600 text-xs">{t("adminBank.wallet")}</Badge>
                  ) : tx.syncError ? (
                    <Badge variant="destructive" className="text-xs">{t("adminBank.error")}</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{t("adminBank.unmatched")}</Badge>
                  )}
                  {isActionableTransaction(tx) && (
                    <Button size="sm" variant="outline" onClick={() => openReconciliation(tx)} data-testid={`button-resolve-tx-${tx.id}`}>
                      {t("adminBank.resolve")}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!resolvingTransaction} onOpenChange={open => {
        if (!open) {
          setResolvingTransaction(null);
          setResolutionUserId("");
          setResolutionTarget("wallet");
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("adminBank.resolveTitle")}</DialogTitle></DialogHeader>
          {resolvingTransaction && (
            <form onSubmit={event => {
              event.preventDefault();
              if (!canReconcile) return;
              reconcileMutation.mutate({
                transactionId: resolvingTransaction.id,
                userId: Number(resolutionUserId),
                paymentId: selectedPayment?.id ?? null,
              });
            }} className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("adminBank.receivedTransaction")}</p>
                    <p className="font-semibold">{resolvingTransaction.payerName || t("adminBank.unknownPayer")}</p>
                  </div>
                  <p className="font-bold">{formatTransactionMoney(resolvingTransaction.amount, resolvingTransaction.currency)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><span className="text-muted-foreground">{t("adminBank.transactionDate")}: </span>{format(new Date(resolvingTransaction.date), "d. MMM yyyy", { locale: dateLocale })}</div>
                  <div><span className="text-muted-foreground">{t("paymentDetail.variableSymbol")}: </span>{resolvingTransaction.variableSymbol || "—"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">{t("adminBank.payerAccount")}: </span>{resolvingTransaction.payerIban || [resolvingTransaction.payerAccount, resolvingTransaction.payerBankCode].filter(Boolean).join("/") || "—"}</div>
                  {resolvingTransaction.memo && <div className="col-span-2"><span className="text-muted-foreground">{t("adminBank.memo")}: </span>{resolvingTransaction.memo}</div>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("adminBank.player")}</Label>
                <Select value={resolutionUserId} onValueChange={value => {
                  setResolutionUserId(value);
                  setResolutionTarget("wallet");
                }}>
                  <SelectTrigger data-testid="select-reconciliation-user"><SelectValue placeholder={t("adminBank.selectPlayer")} /></SelectTrigger>
                  <SelectContent>
                    {sortedUsers.map(user => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUser && (
                  <p className="text-xs text-muted-foreground">
                    {t("adminBank.currentWallet", { amount: formatMoney(selectedUser.walletBalance ?? 0) })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("adminBank.resolveAs")}</Label>
                <Select value={resolutionTarget} onValueChange={setResolutionTarget} disabled={!resolutionUserId}>
                  <SelectTrigger data-testid="select-reconciliation-target"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wallet">{t("adminBank.creditWholeToWallet")}</SelectItem>
                    {eligiblePayments.map(payment => {
                      const outstandingMinor = Math.round((payment.amount - payment.walletAppliedAmount) * 100);
                      const underpaid = receivedMinor < outstandingMinor;
                      return (
                        <SelectItem key={payment.id} value={`payment:${payment.id}`} disabled={underpaid}>
                          {payment.description} · {formatMoney(outstandingMinor / 100)} · {t("paymentDetail.dueDate")}: {format(new Date(payment.dueDate), "d. M. yyyy", { locale: dateLocale })}{payment.variableSymbol ? ` · VS: ${payment.variableSymbol}` : ""}{underpaid ? ` · ${t("adminBank.amountTooLowShort")}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {!!resolutionUserId && eligiblePayments.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("adminBank.noEligiblePayments")}</p>
                )}
                {!!resolutionUserId && eligiblePayments.some(payment => receivedMinor < Math.round((payment.amount - payment.walletAppliedAmount) * 100)) && (
                  <p className="text-xs text-muted-foreground">{t("adminBank.underpaymentHint")}</p>
                )}
              </div>

              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <p className="font-medium">{t("adminBank.allocationPreview")}</p>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t("adminBank.received")}</span><span>{formatTransactionMoney(receivedMinor, resolvingTransaction.currency)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t("adminBank.paymentAllocation")}</span><span>{formatTransactionMoney(paymentAllocationMinor, "CZK")}</span></div>
                <div className="flex justify-between gap-3 font-medium"><span>{t("adminBank.walletCredit")}</span><span>{formatTransactionMoney(Math.max(0, walletCreditMinor), "CZK")}</span></div>
              </div>

              {isUnderpayment && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{t("adminBank.underpaymentError")}</p>
              )}
              {hasFractionalWalletCredit && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{t("adminBank.fractionalWalletError")}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResolvingTransaction(null)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={!canReconcile || reconcileMutation.isPending} data-testid="button-confirm-reconciliation">
                  {reconcileMutation.isPending ? t("common.saving") : t("adminBank.confirmResolution")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cashDialogOpen} onOpenChange={open => {
        setCashDialogOpen(open);
        if (!open) setCashForm({ type: "income", amount: "", description: "" });
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("adminBank.newMovement")}</DialogTitle></DialogHeader>
          <form onSubmit={event => { event.preventDefault(); cashMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("adminBank.movementType")}</Label>
              <Select value={cashForm.type} onValueChange={value => setCashForm(previous => ({ ...previous, type: value as "income" | "expense" }))}>
                <SelectTrigger data-testid="select-cash-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t("adminBank.incomeToCashbox")}</SelectItem>
                  <SelectItem value="expense">{t("adminBank.expenseFromCashbox")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-amount">{t("adminBank.amountIn", { currency })}</Label>
              <Input id="cash-amount" type="number" min="1" step="1" value={cashForm.amount} onChange={event => setCashForm(previous => ({ ...previous, amount: event.target.value }))} required data-testid="input-cash-amount" />
              {cashForm.type === "expense" && cashbox && <p className="text-xs text-muted-foreground">{t("adminBank.availableCash", { amount: formatMoney(cashbox.balance) })}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-description">{t("adminBank.description")}</Label>
              <Input id="cash-description" value={cashForm.description} onChange={event => setCashForm(previous => ({ ...previous, description: event.target.value }))} maxLength={200} placeholder={t("adminBank.cashPlaceholder")} required data-testid="input-cash-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCashDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={cashMutation.isPending || !cashForm.amount || !cashForm.description.trim()} data-testid="button-save-cash-transaction">
                {cashMutation.isPending ? t("common.saving") : t("adminBank.saveMovement")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
