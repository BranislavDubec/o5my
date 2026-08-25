import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CreditCard, Search, X, CheckCircle2, Clock, AlertCircle, ChevronRight, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";
import { groupPaymentsByIdentity, type PaymentWithUser } from "@/lib/payment-identities";

interface UserItem {
  id: number;
  name: string;
  isActive: boolean;
}

export default function AdminPayments() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    userIds: [] as number[],
    priceMode: "full" as "full" | "perPerson",
    price: "",
    dueDate: "",
    description: "",
    identity: "",
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const sortLang = lang === "cz" ? "cs" : lang;

  const { data: payments = [] } = useQuery<PaymentWithUser[]>({
    queryKey: ["/api/payments/all"],
  });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });
  const activeUsers = users.filter(user => user.isActive);
  const paymentIdentities = Array.from(
    new Set(payments.map(payment => payment.identity?.trim()).filter((value): value is string => !!value)),
  ).sort((a, b) => a.localeCompare(b, sortLang));

  const groups = groupPaymentsByIdentity(payments);
  const normalizedSearch = searchFilter.trim().toLocaleLowerCase(sortLang);
  const filteredGroups = groups.filter(group => {
    if (statusFilter !== "all" && group.status !== statusFilter) return false;
    if (!normalizedSearch) return true;
    return [group.identity ?? t("adminPayments.noIdentity"), ...group.payments.flatMap(p => [p.description, p.user.name])]
      .some(value => value.toLocaleLowerCase(sortLang).includes(normalizedSearch));
  });
  const filtersActive = statusFilter !== "all" || normalizedSearch.length > 0;

  const selectedCount = form.userIds.length;
  const enteredPrice = Number(form.price);
  const splitPreview = selectedCount > 0 && Number.isInteger(enteredPrice) && enteredPrice > 0
    ? form.priceMode === "perPerson"
      ? {
          perMember: enteredPrice,
          fullPrice: enteredPrice * selectedCount,
          remainder: 0,
        }
      : {
          perMember: Math.floor(enteredPrice / selectedCount),
          fullPrice: enteredPrice,
          remainder: enteredPrice % selectedCount,
        }
    : null;

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", "/api/payments/bulk", data);
      return response.json() as Promise<{ created?: number }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: result.created === 1 ? t("adminPayments.paymentCreated") : t("adminPayments.paymentsCreated", { count: result.created ?? 0 }),
      });
      setDialogOpen(false);
      setForm({ userIds: [], priceMode: "full", price: "", dueDate: "", description: "", identity: "" });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.userIds.length === 0) return;
    createMutation.mutate({
      userIds: form.userIds,
      priceMode: form.priceMode,
      price: parseInt(form.price),
      dueDate: form.dueDate,
      description: form.description,
      identity: form.identity,
    });
  };

  const toggleUser = (userId: number, selected: boolean) => {
    setForm(previous => ({
      ...previous,
      userIds: selected
        ? Array.from(new Set([...previous.userIds, userId]))
        : previous.userIds.filter(id => id !== userId),
    }));
  };

  const statusConfig = {
    paid: { label: t("adminPayments.everyonePaid"), variant: "default" as const, icon: CheckCircle2, color: "text-green-600 dark:text-green-400", className: "bg-green-600" },
    pending: { label: t("adminPayments.awaitingPayment"), variant: "secondary" as const, icon: Clock, color: "text-yellow-600 dark:text-yellow-400", className: "" },
    overdue: { label: t("payments.overdue"), variant: "destructive" as const, icon: AlertCircle, color: "text-red-600 dark:text-red-400", className: "" },
  };

  const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = groups.reduce((s, group) => s + group.outstandingAmount, 0);

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchFilter("");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">{t("adminPayments.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("adminPayments.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-payment"><Plus className="w-4 h-4 mr-1" />{t("adminPayments.add")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("adminPayments.newPayment")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>{t("adminPayments.membersSelected", { count: form.userIds.length })}</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm(previous => ({ ...previous, userIds: activeUsers.map(user => user.id) }))}
                      disabled={activeUsers.length === 0 || form.userIds.length === activeUsers.length}
                    >
                      {t("adminPayments.selectAll")}
                    </Button>
                    {form.userIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setForm(previous => ({ ...previous, userIds: [] }))}
                      >
                        {t("common.cancel")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2" data-testid="payment-user-list">
                  {activeUsers.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">{t("adminPayments.noActiveMembers")}</p>
                  ) : activeUsers.map(user => {
                    const checkboxId = `payment-user-${user.id}`;
                    return (
                    <div key={user.id} className="flex items-center gap-3 rounded-md px-2 hover:bg-muted">
                      <Checkbox
                        id={checkboxId}
                        checked={form.userIds.includes(user.id)}
                        onCheckedChange={checked => toggleUser(user.id, checked === true)}
                        data-testid={`checkbox-payment-user-${user.id}`}
                      />
                      <Label htmlFor={checkboxId} className="flex-1 cursor-pointer py-2 font-normal">
                        {user.name}
                      </Label>
                    </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("adminPayments.perMemberHint")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="priceMode">{t("adminPayments.priceMode")}</Label>
                  <Select
                    value={form.priceMode}
                    onValueChange={(value: "full" | "perPerson") => setForm({ ...form, priceMode: value })}
                  >
                    <SelectTrigger id="priceMode" data-testid="select-price-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">{t("adminPayments.fullPrice")}</SelectItem>
                      <SelectItem value="perPerson">{t("adminPayments.pricePerPerson")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">
                    {form.priceMode === "full" ? t("adminPayments.fullPrice") : t("adminPayments.pricePerPerson")}
                  </Label>
                  <Input id="price" type="number" min="1" step="1" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required data-testid="input-payment-price" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">{t("adminPayments.dueDate")}</Label>
                  <Input id="dueDate" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} required data-testid="input-due-date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identity">{t("adminPayments.identity")}</Label>
                {paymentIdentities.length > 0 && (
                  <Select
                    value={paymentIdentities.includes(form.identity) ? form.identity : "__new__"}
                    onValueChange={value => setForm({ ...form, identity: value === "__new__" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-payment-identity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">{t("adminPayments.newIdentity")}</SelectItem>
                      {paymentIdentities.map(identity => (
                        <SelectItem key={identity} value={identity}>{identity}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  id="identity"
                  value={form.identity}
                  onChange={e => setForm({ ...form, identity: e.target.value })}
                  placeholder={t("adminPayments.identityPlaceholder")}
                  data-testid="input-payment-identity"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("adminPayments.vsHint")}
                </p>
                {splitPreview && selectedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("adminPayments.perMemberPrice", {
                      amount: splitPreview.perMember,
                      count: selectedCount,
                    })}
                    {splitPreview.remainder > 0 && ` ${t("adminPayments.splitRemainder", { count: splitPreview.remainder })}`}
                    {form.priceMode === "perPerson" && ` ${t("adminPayments.calculatedFullPrice", { amount: splitPreview.fullPrice })}`}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">{t("adminPayments.description")}</Label>
                <Textarea id="desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required rows={2} placeholder={t("adminPayments.descriptionPlaceholder")} data-testid="input-description" />
                <p className="text-xs text-muted-foreground">{t("adminPayments.nameAppendedHint")}</p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || form.userIds.length === 0} data-testid="button-submit-payment">
                  {createMutation.isPending
                    ? t("adminPayments.creating")
                    : form.userIds.length === 1
                      ? t("adminPayments.createOne")
                      : t("adminPayments.createMany", { count: form.userIds.length })}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="payment-filters">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="payment-search">{t("adminPayments.searchLabel")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="payment-search"
                  value={searchFilter}
                  onChange={event => setSearchFilter(event.target.value)}
                  placeholder={t("adminPayments.searchIdentityPlaceholder")}
                  className="pl-9"
                  data-testid="filter-payment-search"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:w-56">
              <Label>{t("adminPayments.statusFilter")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="filter-payment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("adminPayments.allStatuses")}</SelectItem>
                  <SelectItem value="paid">{t("adminPayments.everyonePaid")}</SelectItem>
                  <SelectItem value="pending">{t("adminPayments.awaitingPayment")}</SelectItem>
                  <SelectItem value="overdue">{t("payments.overdue")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-payment-filters">
                <X className="mr-1 h-4 w-4" />{t("adminPayments.clearFilters")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("adminPayments.shownOfIdentities", { shown: filteredGroups.length, total: groups.length })}
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("adminPayments.paidTotal")}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{totalPaid} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("adminPayments.pendingTotal")}</p>
            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{totalPending} Kč</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment identities */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("payments.none")}</p>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">{t("adminPayments.noMatch")}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              {t("adminPayments.clearFilters")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(group => {
            const cfg = statusConfig[group.status];
            const Icon = cfg.icon;
            const dueLabel = group.dueDateFrom === group.dueDateTo
              ? t("payments.due", { date: format(parseISO(group.dueDateTo), "d. MMM yyyy", { locale: dateLocale }) })
              : t("adminPayments.dueRange", {
                  from: format(parseISO(group.dueDateFrom), "d. MMM yyyy", { locale: dateLocale }),
                  to: format(parseISO(group.dueDateTo), "d. MMM yyyy", { locale: dateLocale }),
                });
            return (
              <Link key={group.href} href={group.href} data-testid={`link-payment-identity-${group.identity ?? "unassigned"}`}>
                <Card className="cursor-pointer transition-colors hover:border-primary/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-muted ${cfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{group.identity ?? t("adminPayments.noIdentity")}</p>
                        <Badge variant={cfg.variant} className={cfg.className} data-testid={`badge-identity-status-${group.identity ?? "unassigned"}`}>
                          {group.status === "paid" ? cfg.label : t("adminPayments.paidProgress", { paid: group.paidCount, total: group.memberCount })}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" />{t("adminPayments.memberCount", { count: group.memberCount })}
                        </span>
                        <span className="font-semibold text-foreground">{group.totalAmount} Kč</span>
                        {group.outstandingAmount > 0 && (
                          <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                            {t("payments.remaining", { amount: group.outstandingAmount })}
                          </span>
                        )}
                        <span>{dueLabel}</span>
                      </div>
                      {group.status !== "paid" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("adminPayments.unpaidMembers", { count: group.memberCount - group.paidCount })}
                          {group.status === "overdue" && ` · ${t("payments.overdue")}`}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
