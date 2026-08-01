import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Vote, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";

interface Poll {
  id: number;
  title: string;
  description: string | null;
  closesAt: string | null;
  createdAt: string;
}

export default function PollsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", options: ["", ""] });

  const { data: polls = [] } = useQuery<Poll[]>({
    queryKey: ["/api/polls"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/polls", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      toast({ title: "Anketa vytvorená" });
      setDialogOpen(false);
      setForm({ title: "", description: "", options: ["", ""] });
    },
    onError: (err: any) => toast({ title: "Chyba", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/polls/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      toast({ title: "Anketa zmazaná" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const options = form.options.filter(o => o.trim());
    if (options.length < 2) {
      toast({ title: "Pridaj aspoň 2 možnosti", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      options,
    });
  };

  const isClosed = (closesAt: string | null) => closesAt && new Date(closesAt) < new Date();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">Ankety</h1>
          <p className="text-sm text-muted-foreground mt-1">Hlasuj a rozhoduj s tímom</p>
        </div>
        {user?.role === "admin" && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-poll"><Plus className="w-4 h-4 mr-1" />Nová anketa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nová anketa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Otázka</Label>
                  <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Kedy hráme zápas?" data-testid="input-poll-title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Popis (voliteľné)</Label>
                  <Textarea id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} data-testid="input-poll-description" />
                </div>
                <div className="space-y-2">
                  <Label>Možnosti</Label>
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={e => {
                          const opts = [...form.options];
                          opts[i] = e.target.value;
                          setForm({ ...form, options: opts });
                        }}
                        placeholder={`Možnosť ${i + 1}`}
                        data-testid={`input-option-${i}`}
                      />
                      {form.options.length > 2 && (
                        <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })}>
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                    <Plus className="w-3 h-3 mr-1" />Pridať možnosť
                  </Button>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-poll">
                    {createMutation.isPending ? "Vytváram..." : "Vytvoriť"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {polls.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Vote className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Žiadne ankety</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {polls.map(poll => (
            <Link key={poll.id} href={`/polls/${poll.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-poll-${poll.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{poll.title}</p>
                      {poll.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{poll.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(parseISO(poll.createdAt), "d. MMM yyyy", { locale: sk })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isClosed(poll.closesAt) ? (
                        <Badge variant="secondary">Uzavretá</Badge>
                      ) : (
                        <Badge variant="default">Aktívna</Badge>
                      )}
                      {user?.role === "admin" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("Zmazať anketu?")) deleteMutation.mutate(poll.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
