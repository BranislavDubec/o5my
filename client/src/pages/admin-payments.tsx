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
import { Plus, Trash2, CreditCard, QrCode } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";

interface PaymentWithUser {
  id: number;
  userId: number;
  amount: number;
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
}

export default function AdminPayments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ userIds: [] as number[], amount: "", dueDate: "", description: "" });

  const { data: payments = [] } = useQuery<PaymentWithUser[]>({
    queryKey: ["/api/payments/all"],
  });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });
  const activeUsers = users.filter(user => user.isActive);

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
        title: result.created === 1 ? "Platba vytvorená" : `${result.created ?? 0} platieb vytvorených`,
      });
      setDialogOpen(false);
      setForm({ userIds: [], amount: "", dueDate: "", description: "" });
    },
    onError: (err: any) => toast({ title: "Chyba", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/payments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Status aktualizovaný" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Platba zmazaná" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.userIds.length === 0) return;
    createMutation.mutate({
      userIds: form.userIds,
      amount: parseInt(form.amount),
      dueDate: form.dueDate,
      description: form.description,
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
      case "paid": return <Badge variant="default" className="bg-green-600">Zaplatené</Badge>;
      case "overdue": return <Badge variant="destructive">Po termíne</Badge>;
      default: return <Badge variant="secondary">Čaká</Badge>;
    }
  };

  const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((s, p) => s + getOutstandingAmount(p), 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">Správa platieb</h1>
          <p className="text-sm text-muted-foreground mt-1">Vytváraj a sleduj platby členov</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-payment"><Plus className="w-4 h-4 mr-1" />Pridať</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nová platba</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Členovia ({form.userIds.length} vybraných)</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setForm(previous => ({ ...previous, userIds: activeUsers.map(user => user.id) }))}
                      disabled={activeUsers.length === 0 || form.userIds.length === activeUsers.length}
                    >
                      Vybrať všetkých
                    </Button>
                    {form.userIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setForm(previous => ({ ...previous, userIds: [] }))}
                      >
                        Zrušiť
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2" data-testid="payment-user-list">
                  {activeUsers.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">Nie sú dostupní žiadni aktívni členovia</p>
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
                  Pre každého vybraného člena sa vytvorí samostatná platba.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">Suma (Kč)</Label>
                  <Input id="amount" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required data-testid="input-amount" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Splatnosť</Label>
                  <Input id="dueDate" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} required data-testid="input-due-date" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Variabilný symbol sa vygeneruje automaticky ako jedinečné číslo platby.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Popis</Label>
                <Textarea id="desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required rows={2} placeholder="Členské poplatky, dresy,..." data-testid="input-description" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || form.userIds.length === 0} data-testid="button-submit-payment">
                  {createMutation.isPending
                    ? "Vytváram..."
                    : form.userIds.length === 1
                      ? "Vytvoriť platbu"
                      : `Vytvoriť ${form.userIds.length} platieb`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Zaplatené spolu</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{totalPaid} Kč</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Čaká na úhradu</p>
            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{totalPending} Kč</p>
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
        <div className="space-y-2">
          {payments.map(p => {
            const outstandingAmount = getOutstandingAmount(p);
            return <Card key={p.id} data-testid={`card-payment-${p.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{p.user.name}</p>
                    {statusBadge(p.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.amount} Kč</span>
                    {p.walletAppliedAmount > 0 && (
                      <span className="text-green-700 dark:text-green-400">Peňaženka: {p.walletAppliedAmount} Kč</span>
                    )}
                    {p.walletAppliedAmount > 0 && outstandingAmount > 0 && (
                      <span className="font-semibold text-yellow-700 dark:text-yellow-400">Zostáva: {outstandingAmount} Kč</span>
                    )}
                    <span>Splatnosť: {format(parseISO(p.dueDate), "d. MMM yyyy", { locale: sk })}</span>
                    {p.variableSymbol && <span>VS: {p.variableSymbol}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link href={`/payments/${p.id}`} data-testid={`button-payment-detail-${p.id}`}>
                      <QrCode className="w-3 h-3 mr-1" />Detail
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
                      <SelectItem value="pending">Čaká</SelectItem>
                      <SelectItem value="paid">Zaplatené</SelectItem>
                      <SelectItem value="overdue">Po termíne</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => { if (confirm("Zmazať platbu?")) deleteMutation.mutate(p.id); }}
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
