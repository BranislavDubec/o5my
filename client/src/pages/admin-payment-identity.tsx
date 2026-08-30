import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2, QrCode, Search, X, CheckCircle2, Clock, AlertCircle, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";
import {
  getOutstandingAmount,
  groupPaymentsByIdentity,
  matchesIdentityParam,
  type PaymentWithUser,
} from "@/lib/payment-identities";

/**
 * People who have to pay one payment identity, with their current paid status.
 * `unassigned` renders the group of payments created without an identity.
 */
export default function AdminPaymentIdentity({ unassigned = false }: { unassigned?: boolean }) {
  const { identity: identityParam = "" } = useParams<{ identity?: string }>();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const sortLang = lang === "cz" ? "cs" : lang;

  const { data: payments = [], isLoading } = useQuery<PaymentWithUser[]>({
    queryKey: ["/api/payments/all"],
  });

  const group = groupPaymentsByIdentity(payments).find(candidate =>
    unassigned ? candidate.identity === null : matchesIdentityParam(candidate.identity, identityParam),
  );

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/payments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("adminPayments.statusUpdated") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("adminPayments.paymentDeleted") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const backLink = (
    <Link href="/admin/payments">
      <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-back-to-payments">
        <ArrowLeft className="w-4 h-4 mr-1" />{t("adminPayments.backToPayments")}
      </Button>
    </Link>
  );

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!group) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-destructive">{t("adminPayments.identityNotFound")}</p>
      </div>
    );
  }

  const statusConfig = {
    paid: { label: t("adminPayments.everyonePaid"), variant: "default" as const, icon: CheckCircle2, className: "bg-green-600" },
    pending: { label: t("adminPayments.awaitingPayment"), variant: "secondary" as const, icon: Clock, className: "" },
    overdue: { label: t("payments.overdue"), variant: "destructive" as const, icon: AlertCircle, className: "" },
  };
  const groupStatus = statusConfig[group.status];
  const GroupStatusIcon = groupStatus.icon;

  const memberStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default" className="bg-green-600">{t("payments.paid")}</Badge>;
      case "overdue": return <Badge variant="destructive">{t("payments.overdue")}</Badge>;
      default: return <Badge variant="secondary">{t("payments.pending")}</Badge>;
    }
  };

  const normalizedSearch = searchFilter.trim().toLocaleLowerCase(sortLang);
  const members = group.payments
    .filter(payment => {
      if (statusFilter !== "all" && payment.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [payment.user.name, payment.description, payment.variableSymbol ?? ""]
        .some(value => value.toLocaleLowerCase(sortLang).includes(normalizedSearch));
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name, sortLang));
  const filtersActive = statusFilter !== "all" || normalizedSearch.length > 0;
  const clearFilters = () => {
    setStatusFilter("all");
    setSearchFilter("");
  };

  // The card already carries the "due date" label, so only the dates go here.
  const dueLabel = group.dueDateFrom === group.dueDateTo
    ? format(parseISO(group.dueDateTo), "d. MMMM yyyy", { locale: dateLocale })
    : `${format(parseISO(group.dueDateFrom), "d. MMM yyyy", { locale: dateLocale })} – ${format(parseISO(group.dueDateTo), "d. MMM yyyy", { locale: dateLocale })}`;

  return (
    <div className="space-y-6 max-w-3xl">
      {backLink}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-bold" data-testid="text-identity-title">
            {group.identity ?? t("adminPayments.noIdentity")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("adminPayments.paidProgress", { paid: group.paidCount, total: group.memberCount })}
          </p>
        </div>
        <Badge variant={groupStatus.variant} className={`shrink-0 ${groupStatus.className}`} data-testid="badge-identity-status">
          <GroupStatusIcon className="w-3.5 h-3.5 mr-1" />{groupStatus.label}
        </Badge>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("adminPayments.membersToPayCount")}</p>
            <p className="font-semibold">{group.memberCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("adminPayments.totalAmount")}</p>
            <p className="font-semibold">{group.totalAmount} Kč</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("adminPayments.paidTotal")}</p>
            <p className="font-semibold text-green-600 dark:text-green-400">{group.paidAmount} Kč</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("adminPayments.pendingTotal")}</p>
            <p className="font-semibold text-yellow-600 dark:text-yellow-400">{group.outstandingAmount} Kč</p>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground">{t("adminPayments.dueDate")}</p>
            <p className="font-medium">{dueLabel}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />{t("adminPayments.membersToPay")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="member-search">{t("adminPayments.memberFilter")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="member-search"
                  value={searchFilter}
                  onChange={event => setSearchFilter(event.target.value)}
                  placeholder={t("adminPayments.searchMemberPlaceholder")}
                  className="pl-9"
                  data-testid="filter-member-search"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:w-48">
              <Label>{t("adminPayments.statusFilter")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="filter-member-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("adminPayments.allStatuses")}</SelectItem>
                  <SelectItem value="pending">{t("paymentDetail.pendingPay")}</SelectItem>
                  <SelectItem value="paid">{t("payments.paid")}</SelectItem>
                  <SelectItem value="overdue">{t("payments.overdue")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-member-filters">
                <X className="mr-1 h-4 w-4" />{t("adminPayments.clearFilters")}
              </Button>
            )}
          </div>

          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("adminPayments.noMemberMatch")}</p>
          ) : (
            <div className="space-y-2">
              {members.map(payment => {
                const outstandingAmount = getOutstandingAmount(payment);
                return (
                  <div key={payment.id} className="flex items-center gap-3 rounded-lg border p-3" data-testid={`card-payment-${payment.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{payment.user.name}</p>
                        {memberStatusBadge(payment.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{payment.amount} Kč</span>
                        {payment.walletAppliedAmount > 0 && (
                          <span className="text-green-700 dark:text-green-400">{t("adminPayments.walletApplied", { amount: payment.walletAppliedAmount })}</span>
                        )}
                        {payment.walletAppliedAmount > 0 && outstandingAmount > 0 && (
                          <span className="font-semibold text-yellow-700 dark:text-yellow-400">{t("payments.remaining", { amount: outstandingAmount })}</span>
                        )}
                        <span>{t("payments.due", { date: format(parseISO(payment.dueDate), "d. MMM yyyy", { locale: dateLocale }) })}</span>
                        {payment.variableSymbol && <span>VS: {payment.variableSymbol}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{payment.description}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <Link href={`/payments/${payment.id}`} data-testid={`button-payment-detail-${payment.id}`}>
                          <QrCode className="w-3 h-3 mr-1" />{t("adminPayments.detailButton")}
                        </Link>
                      </Button>
                      <Select
                        value={payment.status}
                        onValueChange={value => updateStatusMutation.mutate({ id: payment.id, status: value })}
                        disabled={payment.walletAppliedAmount >= payment.amount}
                      >
                        <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-status-${payment.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t("payments.pending")}</SelectItem>
                          <SelectItem value="paid">{t("payments.paid")}</SelectItem>
                          <SelectItem value="overdue">{t("payments.overdue")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive"
                        onClick={() => { if (confirm(t("adminPayments.deleteConfirm"))) deleteMutation.mutate(payment.id); }}
                        data-testid={`button-delete-payment-${payment.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
