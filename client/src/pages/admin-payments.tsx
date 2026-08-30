import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CreditCard, QrCode, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";

interface PaymentWithUser {
  id: number;
  userId: number;
  amount: number;
  fullPrice: number;
  identity: string | null;
  walletAppliedAmount: number;
  dueDate: string;
  variableSymbol: string | null;
  description: string;
  status: string;
  user: { id: number; name: string };
}

function getOutstandingAmount(payment: PaymentWithUser) {
  return Math.max(0, payment.amount - payment.walletAppliedAmount);
}

interface UserItem {
  id: number;
  name: string;
  isActive: boolean;
  isPlayerActive: boolean;
  emailVerified: boolean;
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
  const [userFilter, setUserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [identityFilter, setIdentityFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const sortLang = lang === "cz" ? "cs" : lang;

  const { data: payments = [] } = useQuery<PaymentWithUser[]>({
    queryKey: ["/api/payments/all"],
  });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });
  const allPlayers = users
    .filter(user => user.isActive && user.emailVerified)
    .sort((a, b) => a.name.localeCompare(b.name, sortLang));
  const activePlayers = allPlayers.filter(user => user.isPlayerActive);
  const paymentUsers = Array.from(
    new Map(payments.map(payment => [payment.user.id, payment.user])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, sortLang));
  const paymentIdentities = Array.from(
    new Set(payments.map(payment => payment.identity?.trim()).filter((value): value is string => !!value)),
  ).sort((a, b) => a.localeCompare(b, sortLang));

  const normalizedSearch = searchFilter.trim().toLocaleLowerCase(sortLang);
  const filteredPayments = payments.filter(payment => {
    if (userFilter !== "all" && payment.userId !== Number(userFilter)) return false;
    if (statusFilter !== "all" && payment.status !== statusFilter) return false;
    if (identityFilter !== "all" && (payment.identity ?? "") !== identityFilter) return false;
    if (!normalizedSearch) return true;
    return [payment.user.name, payment.description, payment.variableSymbol ?? "", payment.identity ?? ""]
      .some(value => value.toLocaleLowerCase(sortLang).includes(normalizedSearch));
  });
  const filtersActive = userFilter !== "all" || statusFilter !== "all" || identityFilter !== "all" || normalizedSearch.length > 0;

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

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default" className="bg-green-600">{t("payments.paid")}</Badge>;
      case "overdue": return <Badge variant="destructive">{t("payments.overdue")}</Badge>;
      default: return <Badge variant="secondary">{t("payments.pending")}</Badge>;
    }
  };

  const totalPaid = filteredPayments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = filteredPayments.filter(p => p.status === "pending").reduce((s, p) => s + getOutstandingAmount(p), 0);

  const clearFilters = () => {
    setUserFilter("all");
    setStatusFilter("all");
    setIdentityFilter("all");
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("adminPayments.membersSelected", { count: form.userIds.length })}</Label>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm(previous => ({ ...previous, userIds: activePlayers.map(user => user.id) }))}
                      disabled={activePlayers.length === 0}
                    >
                      {t("adminPayments.selectAllActivePlayers")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm(previous => ({ ...previous, userIds: allPlayers.map(user => user.id) }))}
                      disabled={allPlayers.length === 0}
                    >
                      {t("adminPayments.selectAllPlayers")}
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
                  {allPlayers.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">{t("adminPayments.noMembers")}</p>
                  ) : allPlayers.map(user => {
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
                      {!user.isPlayerActive && (
                        <Badge variant="secondary" className="text-[10px]">{t("adminPayments.inactivePlayer")}</Badge>
                      )}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("adminPayments.memberFilter")}</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger data-testid="filter-payment-user">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("adminPayments.allMembers")}</SelectItem>
                  {paymentUsers.map(user => (
                    <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("adminPayments.statusFilter")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="filter-payment-status">
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
            <div className="space-y-1.5">
              <Label>{t("adminPayments.identityFilter")}</Label>
              <Select value={identityFilter} onValueChange={setIdentityFilter}>
                <SelectTrigger data-testid="filter-payment-identity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("adminPayments.allIdentities")}</SelectItem>
                  {paymentIdentities.map(identity => (
                    <SelectItem key={identity} value={identity}>{identity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={event => setSearchFilter(event.target.value)}
                placeholder={t("adminPayments.searchPlaceholder")}
                className="pl-9"
                data-testid="filter-payment-search"
              />
            </div>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-payment-filters">
                <X className="mr-1 h-4 w-4" />{t("adminPayments.clearFilters")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("adminPayments.shownOf", { shown: filteredPayments.length, total: payments.length })}
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

      {/* Payment List */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("payments.none")}</p>
          </CardContent>
        </Card>
      ) : filteredPayments.length === 0 ? (
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
          {filteredPayments.map(p => {
            const outstandingAmount = getOutstandingAmount(p);
            return <Card key={p.id} data-testid={`card-payment-${p.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{p.user.name}</p>
                    {statusBadge(p.status)}
                    {p.identity && <Badge variant="outline" className="text-xs">{p.identity}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.amount} Kč</span>
                    {p.fullPrice > p.amount && <span>{t("adminPayments.fullPriceValue", { amount: p.fullPrice })}</span>}
                    {p.walletAppliedAmount > 0 && (
                      <span className="text-green-700 dark:text-green-400">{t("adminPayments.walletApplied", { amount: p.walletAppliedAmount })}</span>
                    )}
                    {p.walletAppliedAmount > 0 && outstandingAmount > 0 && (
                      <span className="font-semibold text-yellow-700 dark:text-yellow-400">{t("payments.remaining", { amount: outstandingAmount })}</span>
                    )}
                    <span>{t("payments.due", { date: format(parseISO(p.dueDate), "d. MMM yyyy", { locale: dateLocale }) })}</span>
                    {p.variableSymbol && <span>VS: {p.variableSymbol}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link href={`/payments/${p.id}`} data-testid={`button-payment-detail-${p.id}`}>
                      <QrCode className="w-3 h-3 mr-1" />{t("adminPayments.detailButton")}
                    </Link>
                  </Button>
                  <Select
                    value={p.status}
                    onValueChange={v => updateStatusMutation.mutate({ id: p.id, status: v })}
                    disabled={p.walletAppliedAmount >= p.amount}
                  >
                    <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-status-${p.id}`}>
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
                    onClick={() => { if (confirm(t("adminPayments.deleteConfirm"))) deleteMutation.mutate(p.id); }}
                    data-testid={`button-delete-payment-${p.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>;
          })}
        </div>
      )}
    </div>
  );
}
