import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, User as UserIcon, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<NotificationSettings>({
    queryKey: ["/api/settings/notifications"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationSettings>) =>
      apiRequest("PUT", "/api/settings/notifications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notifications"] });
      toast({ title: "Nastavenia uložené" });
    },
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
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {user?.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
            </div>
          </div>
          <div className="pt-2">
            <Badge variant="secondary">{user?.role === "admin" ? "Admin" : "Hráč"}</Badge>
          </div>
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
                <p className="text-xs text-muted-foreground">Upozornenia na nové akcie a ankety</p>
              </div>
            </div>
            <Switch
              id="push-toggle"
              checked={settings?.pushEnabled ?? true}
              onCheckedChange={v => updateMutation.mutate({ pushEnabled: v })}
              data-testid="switch-push"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="email-toggle" className="text-sm">Email notifikácie</Label>
                <p className="text-xs text-muted-foreground">Pripomenutia pred zápasmi a tréningami</p>
              </div>
            </div>
            <Switch
              id="email-toggle"
              checked={settings?.emailEnabled ?? true}
              onCheckedChange={v => updateMutation.mutate({ emailEnabled: v })}
              data-testid="switch-email"
            />
          </div>
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

