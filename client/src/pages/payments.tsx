import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle } from "lucide-react";
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

export default function PaymentsPage() {
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
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
              <Card key={payment.id} data-testid={`card-payment-${payment.id}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-muted ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{payment.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{payment.amount} Kč</span>
                      <span>Splatnosť: {format(parseISO(payment.dueDate), "d. MMM yyyy", { locale: sk })}</span>
                      {payment.variableSymbol && <span>VS: {payment.variableSymbol}</span>}
                    </div>
                  </div>
                  <Badge variant={cfg.variant} data-testid={`badge-payment-status-${payment.id}`}>{cfg.label}</Badge>
                </CardContent>
              </Card>
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
