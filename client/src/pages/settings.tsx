import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, User as UserIcon, LogOut, Send, Smartphone, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { usePwaInstall } from "@/contexts/pwa-install-context";

interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  subscriptionCount: number;
}

function profileNameParts(firstName?: string | null, lastName?: string | null, fullName?: string) {
  if (firstName || lastName) return { firstName: firstName ?? "", lastName: lastName ?? "" };
  const normalized = fullName?.trim() ?? "";
  const separatorIndex = normalized.indexOf(" ");
  if (separatorIndex < 0) return { firstName: normalized, lastName: "" };
  return { firstName: normalized.slice(0, separatorIndex), lastName: normalized.slice(separatorIndex + 1) };
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
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusLoading, setPushStatusLoading] = useState(pushSupported);
  const initialName = profileNameParts(user?.firstName, user?.lastName, user?.name);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const { data: settings } = useQuery<NotificationSettings>({
    queryKey: ["/api/settings/notifications"],
  });
  const pushActive = pushSubscribed && (settings?.pushEnabled ?? true);

  useEffect(() => {
    const currentName = profileNameParts(user?.firstName, user?.lastName, user?.name);
    setFirstName(currentName.firstName);
    setLastName(currentName.lastName);
    setNickname(user?.nickname ?? "");
  }, [user?.firstName, user?.lastName, user?.name, user?.nickname]);

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ firstName, lastName, nickname }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: t("settings.profileSaved") });
    },
    onError: (error: Error) => toast({ title: t("settings.profileSaveFailed"), description: error.message, variant: "destructive" }),
  });

  const passwordMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/auth/password", { currentPassword, password: newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      toast({ title: t("settings.passwordChanged") });
    },
    onError: (error: Error) => toast({ title: t("settings.passwordChangeFailed"), description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationSettings>) =>
      apiRequest("PUT", "/api/settings/notifications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notifications"] });
      toast({ title: t("settings.settingsSaved") });
    },
    onError: (error: Error) => toast({ title: t("settings.settingsSaveFailed"), description: error.message, variant: "destructive" }),
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
        throw new Error(t("settings.pushRequiresHttps"));
      }

      const registration = await getServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error(t("settings.pushPermissionNeeded"));
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
      toast({ title: enabled ? t("settings.pushEnabled") : t("settings.pushDisabled") });
    },
    onError: (error: Error) => toast({ title: t("settings.pushSetupFailed"), description: error.message, variant: "destructive" }),
  });

  const testNotificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/test"),
    onSuccess: () => toast({ title: t("settings.testSent"), description: t("settings.testSentHint") }),
    onError: (error: Error) => toast({ title: t("settings.testFailed"), description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="w-4 h-4" />{t("settings.profile")}
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
            <Badge variant="secondary">
              {user?.role === "admin"
                ? t("layout.roleAdmin")
                : user?.role === "manager"
                  ? t("layout.roleManager")
                  : t("layout.rolePlayer")}
            </Badge>
          </div>
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={submitEvent => {
              submitEvent.preventDefault();
              profileMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">{t("auth.firstName")}</Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={inputEvent => setFirstName(inputEvent.target.value)}
                  required
                  maxLength={80}
                  data-testid="input-profile-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">{t("auth.lastName")}</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={inputEvent => setLastName(inputEvent.target.value)}
                  required
                  maxLength={80}
                  data-testid="input-profile-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-nickname">{t("auth.nickname")}</Label>
              <Input
                id="profile-nickname"
                value={nickname}
                onChange={inputEvent => setNickname(inputEvent.target.value)}
                required
                maxLength={30}
                placeholder={t("settings.nicknamePlaceholder")}
                autoComplete="nickname"
                data-testid="input-profile-nickname"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  profileMutation.isPending
                  || !firstName.trim()
                  || !lastName.trim()
                  || !nickname.trim()
                  || (
                    firstName.trim() === (user?.firstName ?? initialName.firstName)
                    && lastName.trim() === (user?.lastName ?? initialName.lastName)
                    && nickname.trim() === (user?.nickname ?? "")
                  )
                }
                data-testid="button-save-profile"
              >
                {profileMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
            {!user?.nickname && <p className="text-xs text-amber-600 dark:text-amber-400">{t("settings.nicknameHint")}</p>}
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LockKeyhole className="w-4 h-4" />{t("settings.passwordChange")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={submitEvent => {
              submitEvent.preventDefault();
              if (newPassword !== passwordConfirmation) {
                toast({ title: t("settings.passwordsMismatch"), variant: "destructive" });
                return;
              }
              passwordMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("settings.currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={inputEvent => setCurrentPassword(inputEvent.target.value)}
                required
                autoComplete="current-password"
                data-testid="input-current-password"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-new-password">{t("auth.password")}</Label>
                <Input
                  id="settings-new-password"
                  type="password"
                  value={newPassword}
                  onChange={inputEvent => setNewPassword(inputEvent.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-settings-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-confirm-password">{t("auth.confirmPassword")}</Label>
                <Input
                  id="settings-confirm-password"
                  type="password"
                  value={passwordConfirmation}
                  onChange={inputEvent => setPasswordConfirmation(inputEvent.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-settings-confirm-password"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t("settings.passwordHint")}</p>
              <Button
                type="submit"
                disabled={passwordMutation.isPending || !currentPassword || newPassword.length < 8 || passwordConfirmation.length < 8}
                data-testid="button-change-password"
              >
                {passwordMutation.isPending ? t("common.saving") : t("settings.changePassword")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />{t("settings.notifications")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="push-toggle" className="text-sm">{t("settings.pushNotifications")}</Label>
                <p className="text-xs text-muted-foreground">
                  {!pushSupported
                    ? t("settings.pushUnsupported")
                    : pushActive
                      ? t("settings.pushActive")
                      : platform === "ios" && !isInstalled
                        ? t("settings.pushInstallFirst")
                        : t("settings.pushOffHint")}
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
                <Label htmlFor="email-toggle" className="text-sm">{t("settings.emailNotifications")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.emailOffHint")}</p>
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
              <Send className="w-4 h-4 mr-1.5" />{testNotificationMutation.isPending ? t("settings.testSending") : t("settings.testNotification")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* App installation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4" />{t("settings.app")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.appHint")}
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
        <LogOut className="w-4 h-4 mr-2" />{t("settings.logoutButton")}
      </Button>
    </div>
  );
}
