import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Trash2, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";

interface UserItem {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
}

export default function AdminMembers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; userId: number; role: string }>({ open: false, userId: 0, role: "" });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiRequest("PUT", `/api/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Rola aktualizovaná" });
      setRoleDialog({ open: false, userId: 0, role: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Používateľ zmazaný" });
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Členovia tímu</h1>
        <p className="text-sm text-muted-foreground mt-1">{users.length} členov</p>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Žiadni členovia</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} data-testid={`card-user-${u.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{u.name}</p>
                    {u.role === "admin" ? (
                      <Badge variant="default" className="text-xs"><Shield className="w-3 h-3 mr-0.5" />Admin</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs"><UserIcon className="w-3 h-3 mr-0.5" />Hráč</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <p className="text-xs text-muted-foreground">Pridaný: {format(parseISO(u.createdAt), "d. MMM yyyy", { locale: sk })}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Dialog open={roleDialog.open && roleDialog.userId === u.id} onOpenChange={open => setRoleDialog({ open, userId: u.id, role: u.role })}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs" data-testid={`button-role-${u.id}`}>Rola</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Zmeniť rolu — {u.name}</DialogTitle>
                      </DialogHeader>
                      <Select
                        value={roleDialog.role}
                        onValueChange={v => setRoleDialog({ ...roleDialog, role: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="player">Hráč</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => updateRoleMutation.mutate({ id: u.id, role: roleDialog.role })}
                        disabled={updateRoleMutation.isPending}
                        data-testid="button-save-role"
                      >
                        Uložiť
                      </Button>
                    </DialogContent>
                  </Dialog>
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Zmazať ${u.name}?`)) deleteMutation.mutate(u.id); }}
                      data-testid={`button-delete-user-${u.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
