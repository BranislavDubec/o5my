import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MailCheck, Shield, Swords, User as UserIcon, UserCheck, UserX, Users, WalletCards } from "lucide-react";
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
  isPlayerActive: boolean;
  emailVerified: boolean;
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
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: variables.isActive ? t("adminMembers.userActivated") : t("adminMembers.userDeactivated") });
    },
    onError: (err: any) => {
      toast({ title: t("adminMembers.statusChangeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const updatePlayerStatusMutation = useMutation({
    mutationFn: ({ id, isPlayerActive }: { id: number; isPlayerActive: boolean }) =>
      apiRequest("PUT", `/api/users/${id}/player-active`, { isPlayerActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: variables.isPlayerActive
          ? t("adminMembers.playerActivated")
          : t("adminMembers.playerDeactivated"),
      });
    },
    onError: (err: any) => {
      toast({ title: t("adminMembers.playerStatusChangeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/users/${id}/verify-email`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("adminMembers.emailVerified") });
    },
    onError: (err: any) => {
      toast({ title: t("adminMembers.emailVerificationFailed"), description: err.message, variant: "destructive" });
    },
  });

  const activeUserCount = users.filter(user => user.isActive).length;
  const activePlayerCount = users.filter(user => user.isActive && user.isPlayerActive && (!isAdmin || user.emailVerified)).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("adminMembers.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("adminMembers.statusSummary", { players: activePlayerCount, accounts: activeUserCount, total: users.length })}
        </p>
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
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <p className="min-w-0 basis-full break-words text-sm font-medium sm:basis-auto">{u.name}</p>
                        {u.role === "admin" ? (
                          <Badge variant="default" className="text-xs"><Shield className="mr-0.5 h-3 w-3" />{t("layout.roleAdmin")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs"><UserIcon className="mr-0.5 h-3 w-3" />{t("layout.rolePlayer")}</Badge>
                        )}
                        {!u.isActive && <Badge variant="outline" className="text-xs">{t("adminMembers.inactiveBadge")}</Badge>}
                        {u.isPlayerActive === false && <Badge variant="secondary" className="text-xs">{t("adminMembers.playerInactiveBadge")}</Badge>}
                        {u.emailVerified ? (
                          <Badge variant="outline" className="text-xs text-emerald-700 dark:text-emerald-300" data-testid={`badge-email-verified-${u.id}`}>
                            <MailCheck className="mr-1 h-3 w-3" />{t("adminMembers.emailVerifiedBadge")}
                          </Badge>
                        ) : isAdmin ? (
                          <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-300" data-testid={`badge-email-unverified-${u.id}`}>
                            {t("adminMembers.emailUnverifiedBadge")}
                          </Badge>
                        ) : null}
                      </div>
                      {isAdmin && u.email && <p className="mt-1 break-all text-xs text-muted-foreground sm:truncate">{u.email}</p>}
                      {u.nickname && <p className="break-words text-xs font-medium text-primary">@{u.nickname}</p>}
                      {isAdmin && typeof u.walletBalance === "number" && (
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-foreground" data-testid={`wallet-user-${u.id}`}>
                          <WalletCards className="h-3.5 w-3.5 shrink-0 text-primary" />
                          {t("adminMembers.wallet", { amount: formatWalletBalance(u.walletBalance, u.walletCurrency || "CZK") })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{t("adminMembers.addedOn", { date: format(parseISO(u.createdAt), "d. MMM yyyy", { locale: dateLocale }) })}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2 md:min-w-[180px] md:grid-cols-1 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                    <Dialog open={roleDialog.open && roleDialog.userId === u.id} onOpenChange={open => setRoleDialog({ open, userId: u.id, role: u.role })}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full text-xs" disabled={!u.isActive} data-testid={`button-role-${u.id}`}>{t("adminMembers.role")}</Button>
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      disabled={updatePlayerStatusMutation.isPending}
                      onClick={() => updatePlayerStatusMutation.mutate({ id: u.id, isPlayerActive: !u.isPlayerActive })}
                      data-testid={`button-player-status-${u.id}`}
                    >
                      <Swords className="w-3 h-3 mr-1" />
                      {u.isPlayerActive ? t("adminMembers.setPlayerInactive") : t("adminMembers.setPlayerActive")}
                    </Button>
                    {!u.emailVerified && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        disabled={verifyEmailMutation.isPending}
                        onClick={() => {
                          if (confirm(t("adminMembers.verifyEmailConfirm", { name: u.name, email: u.email || "" }))) {
                            verifyEmailMutation.mutate(u.id);
                          }
                        }}
                        data-testid={`button-verify-email-${u.id}`}
                      >
                        <MailCheck className="w-3 h-3 mr-1" />{t("adminMembers.verifyEmail")}
                      </Button>
                    )}
                    {u.id !== currentUser?.id && (
                      <Button
                        variant={u.isActive ? "ghost" : "outline"}
                        size="sm"
                        className={u.isActive ? "w-full text-xs text-destructive hover:text-destructive" : "w-full text-xs"}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
