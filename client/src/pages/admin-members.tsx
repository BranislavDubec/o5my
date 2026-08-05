import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserCheck, UserX, Shield, User as UserIcon, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";

interface UserItem {
  id: number;
  name: string;
  nickname: string | null;
  email?: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  walletBalance?: number;
  walletCurrency?: string;
}

export default function AdminMembers() {
  const { t, lang } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; userId: number; role: string }>({ open: false, userId: 0, role: "" });
  const isAdmin = currentUser?.role === "admin";
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const localeTag = lang === "cz" ? "cs-CZ" : lang === "en" ? "en-US" : "sk-SK";
  const formatWalletBalance = (balance: number, currency: string) => {
    try {
      return new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(balance);
    } catch {
      return `${balance} ${currency}`;
    }
  };

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiRequest("PUT", `/api/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("adminMembers.roleUpdated") });
      setRoleDialog({ open: false, userId: 0, role: "" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/users/${id}/status`, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: variables.isActive ? t("adminMembers.userActivated") : t("adminMembers.userDeactivated") });
    },
    onError: (err: any) => {
      toast({ title: t("adminMembers.statusChangeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const activeUserCount = users.filter(user => user.isActive).length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("adminMembers.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("adminMembers.activeOfTotal", { active: activeUserCount, total: users.length })}</p>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("adminMembers.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} className={u.isActive ? undefined : "opacity-60"} data-testid={`card-user-${u.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{u.name}</p>
                    {u.role === "admin" ? (
                      <Badge variant="default" className="text-xs"><Shield className="w-3 h-3 mr-0.5" />{t("layout.roleAdmin")}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs"><UserIcon className="w-3 h-3 mr-0.5" />{t("layout.rolePlayer")}</Badge>
                    )}
                    {!u.isActive && <Badge variant="outline" className="text-xs">{t("adminMembers.inactiveBadge")}</Badge>}
                  </div>
                  {isAdmin && u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                  {u.nickname && <p className="text-xs font-medium text-primary truncate">@{u.nickname}</p>}
                  {isAdmin && typeof u.walletBalance === "number" && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground" data-testid={`wallet-user-${u.id}`}>
                      <WalletCards className="h-3.5 w-3.5 text-primary" />
                      {t("adminMembers.wallet", { amount: formatWalletBalance(u.walletBalance, u.walletCurrency || "CZK") })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("adminMembers.addedOn", { date: format(parseISO(u.createdAt), "d. MMM yyyy", { locale: dateLocale }) })}</p>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Dialog open={roleDialog.open && roleDialog.userId === u.id} onOpenChange={open => setRoleDialog({ open, userId: u.id, role: u.role })}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs" disabled={!u.isActive} data-testid={`button-role-${u.id}`}>{t("adminMembers.role")}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("adminMembers.changeRoleTitle", { name: u.name })}</DialogTitle>
                        </DialogHeader>
                        <Select
                          value={roleDialog.role}
                          onValueChange={v => setRoleDialog({ ...roleDialog, role: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">{t("layout.roleAdmin")}</SelectItem>
                            <SelectItem value="player">{t("layout.rolePlayer")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => updateRoleMutation.mutate({ id: u.id, role: roleDialog.role })}
                          disabled={updateRoleMutation.isPending}
                          data-testid="button-save-role"
                        >
                          {t("common.save")}
                        </Button>
                      </DialogContent>
                    </Dialog>
                    {u.id !== currentUser?.id && (
                      <Button
                        variant={u.isActive ? "ghost" : "outline"}
                        size="sm"
                        className={u.isActive ? "text-xs text-destructive hover:text-destructive" : "text-xs"}
                        disabled={updateStatusMutation.isPending}
                        onClick={() => {
                          const nextIsActive = !u.isActive;
                          if (nextIsActive || confirm(t("adminMembers.deactivateConfirm", { name: u.name }))) {
                            updateStatusMutation.mutate({ id: u.id, isActive: nextIsActive });
                          }
                        }}
                        data-testid={`button-status-user-${u.id}`}
                      >
                        {u.isActive ? <UserX className="w-3 h-3 mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                        {u.isActive ? t("adminMembers.deactivate") : t("adminMembers.activate")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
