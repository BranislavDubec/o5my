import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, User as UserIcon, LogOut, Send, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { usePwaInstall } from "@/contexts/pwa-install-context";

interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  subscriptionCount: number;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map(character => character.charCodeAt(0)));
}

async function getServiceWorkerRegistration() {
  return (await navigator.serviceWorker.getRegistration("/"))
    || navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const { platform, isInstalled } = usePwaInstall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusLoading, setPushStatusLoading] = useState(pushSupported);
  const [nickname, setNickname] = useState(user?.nickname ?? "");

  const { data: settings } = useQuery<NotificationSettings>({
    queryKey: ["/api/settings/notifications"],
  });
  const pushActive = pushSubscribed && (settings?.pushEnabled ?? true);

  useEffect(() => {
    setNickname(user?.nickname ?? "");
  }, [user?.nickname]);

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ nickname }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: "Profil uložený" });
    },
    onError: (error: Error) => toast({ title: "Profil sa nepodarilo uložiť", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationSettings>) =>
      apiRequest("PUT", "/api/settings/notifications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notifications"] });
      toast({ title: "Nastavenia uložené" });
    },
    onError: (error: Error) => toast({ title: "Nastavenia sa nepodarilo uložiť", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;
    getServiceWorkerRegistration()
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => { if (!cancelled) setPushSubscribed(Boolean(subscription)); })
      .catch(error => console.error("Push subscription check failed", error))
      .finally(() => { if (!cancelled) setPushStatusLoading(false); });
    return () => { cancelled = true; };
  }, [pushSupported]);

  const pushMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!pushSupported || !window.isSecureContext) {
        throw new Error("Push notifikácie vyžadujú HTTPS alebo localhost a podporovaný prehliadač.");
      }

      const registration = await getServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("Povoľ notifikácie v nastaveniach prehliadača alebo telefónu.");
        }
        if (!subscription) {
          const keyResponse = await apiRequest("GET", "/api/notifications/vapid-public-key");
          const { publicKey } = await keyResponse.json() as { publicKey: string };
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        await apiRequest("POST", "/api/notifications/subscribe", subscription.toJSON());
        await apiRequest("PUT", "/api/settings/notifications", { pushEnabled: true });
        return true;
      }

      if (subscription) {
        await apiRequest("DELETE", "/api/notifications/subscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      await apiRequest("PUT", "/api/settings/notifications", { pushEnabled: false });
      return false;
    },
    onSuccess: enabled => {
      setPushSubscribed(enabled);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notifications"] });
      toast({ title: enabled ? "Push notifikácie sú aktívne" : "Push notifikácie sú vypnuté" });
    },
    onError: (error: Error) => toast({ title: "Push notifikácie sa nepodarilo nastaviť", description: error.message, variant: "destructive" }),
  });

  const testNotificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/test"),
    onSuccess: () => toast({ title: "Test bol odoslaný", description: "Push sa môže zobraziť o niekoľko sekúnd; skontroluj aj email." }),
    onError: (error: Error) => toast({ title: "Test zlyhal", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Nastavenia</h1>
        <p className="text-sm text-muted-foreground mt-1">Spravuj svoj účet a notifikácie</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="w-4 h-4" />Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
              {(user?.nickname || user?.name)?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{user?.name}</p>
              {user?.nickname && <p className="text-sm font-medium text-primary">@{user.nickname}</p>}
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {user?.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
            </div>
          </div>
          <div className="pt-2">
            <Badge variant="secondary">{user?.role === "admin" ? "Admin" : "Hráč"}</Badge>
          </div>
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={submitEvent => {
              submitEvent.preventDefault();
              profileMutation.mutate();
            }}
          >
            <Label htmlFor="profile-nickname">Prezývka</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="profile-nickname"
                value={nickname}
                onChange={inputEvent => setNickname(inputEvent.target.value)}
                required
                maxLength={30}
                placeholder="Ako ťa volá tím?"
                autoComplete="nickname"
                data-testid="input-profile-nickname"
              />
              <Button
                type="submit"
                disabled={profileMutation.isPending || !nickname.trim() || nickname.trim() === (user?.nickname ?? "")}
                data-testid="button-save-profile"
              >
                {profileMutation.isPending ? "Ukladám..." : "Uložiť"}
              </Button>
            </div>
            {!user?.nickname && <p className="text-xs text-amber-600 dark:text-amber-400">Doplň si prezývku, aby ťa spoluhráči ľahko rozoznali.</p>}
          </form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />Notifikácie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="push-toggle" className="text-sm">Push notifikácie</Label>
                <p className="text-xs text-muted-foreground">
                  {!pushSupported
                    ? "Tento prehliadač push notifikácie nepodporuje"
                    : pushActive
                      ? "Aktívne na tomto zariadení"
                      : platform === "ios" && !isInstalled
                        ? "Na iPhone najprv nainštaluj aplikáciu na plochu"
                        : "Upozornenia na nové platby a správy od administrátora"}
                </p>
              </div>
            </div>
            <Switch
              id="push-toggle"
              checked={pushActive}
              onCheckedChange={enabled => pushMutation.mutate(enabled)}
              disabled={!pushSupported || (platform === "ios" && !isInstalled) || pushStatusLoading || pushMutation.isPending}
              data-testid="switch-push"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="email-toggle" className="text-sm">Email notifikácie</Label>
                <p className="text-xs text-muted-foreground">Emaily o nových platbách a správy od administrátora</p>
              </div>
            </div>
            <Switch
              id="email-toggle"
              checked={settings?.emailEnabled ?? true}
              onCheckedChange={v => updateMutation.mutate({ emailEnabled: v })}
              data-testid="switch-email"
            />
          </div>
          <div className="pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testNotificationMutation.mutate()}
              disabled={testNotificationMutation.isPending || (!pushActive && !settings?.emailEnabled)}
            >
              <Send className="w-4 h-4 mr-1.5" />{testNotificationMutation.isPending ? "Odosielam..." : "Poslať testovaciu notifikáciu"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* App installation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4" />Aplikácia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pridaj si O5MY Futsal na plochu a otvor ho ako bežnú mobilnú aplikáciu.
          </p>
          <PwaInstallButton showInstalledState className="w-full sm:w-auto" />
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="text-destructive w-full"
        onClick={logout}
        data-testid="button-logout-settings"
      >
        <LogOut className="w-4 h-4 mr-2" />Odhlásiť sa
      </Button>
    </div>
  );
}
