import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";
import { BellRing, CalendarClock, CreditCard, Send, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserItem {
  id: number;
  name: string;
  isActive: boolean;
  emailVerified: boolean;
}

interface EventItem {
  id: number;
  title: string;
  startTime: string;
}

type NotificationContext = "general" | "event" | "payment";
type NotificationTarget = "all" | "user" | "event_unanswered" | "unpaid";

export default function AdminNotifications() {
  const { toast } = useToast();
  const [context, setContext] = useState<NotificationContext>("general");
  const [target, setTarget] = useState<NotificationTarget>("all");
  const [userId, setUserId] = useState("");
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: users = [] } = useQuery<UserItem[]>({ queryKey: ["/api/users"] });
  const { data: events = [] } = useQuery<EventItem[]>({ queryKey: ["/api/events"] });
  const activeUsers = users.filter(user => user.isActive && user.emailVerified);
  const sortedEvents = [...events].sort((first, second) => first.startTime.localeCompare(second.startTime));

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/notifications", {
        context,
        target,
        userId: target === "user" ? Number(userId) : undefined,
        eventId: context === "event" ? Number(eventId) : undefined,
        title,
        body,
      });
      return response.json() as Promise<{ recipientCount: number }>;
    },
    onSuccess: result => {
      toast({ title: "Notifikácia bola odoslaná", description: `Príjemcovia: ${result.recipientCount}` });
      setTitle("");
      setBody("");
    },
    onError: (error: Error) => toast({ title: "Notifikáciu sa nepodarilo odoslať", description: error.message, variant: "destructive" }),
  });

  const changeContext = (value: NotificationContext) => {
    setContext(value);
    setUserId("");
    if (value === "event") {
      setTarget("event_unanswered");
      setTitle("Pripomienka účasti");
      setBody("Nezabudni potvrdiť svoju účasť na evente.");
    } else if (value === "payment") {
      setTarget("unpaid");
      setEventId("");
      setTitle("Pripomienka platby");
      setBody("V aplikácii máš neuhradenú platbu. Otvor si detail a QR kód.");
    } else {
      setTarget("all");
      setEventId("");
      setTitle("");
      setBody("");
    }
  };

  const canSend = title.trim()
    && body.trim()
    && (context !== "event" || eventId)
    && (target !== "user" || userId);

  const submit = () => {
    const broadTarget = target !== "user";
    if (broadTarget && !confirm("Odoslať túto notifikáciu vybranej skupine členov?")) return;
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Notifikácie</h1>
        <p className="text-sm text-muted-foreground mt-1">Vytvor cielenú push a emailovú správu</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BellRing className="w-4 h-4" />Nová notifikácia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Kontext</Label>
            <Select value={context} onValueChange={value => changeContext(value as NotificationContext)}>
              <SelectTrigger data-testid="select-notification-context"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general"><span className="flex items-center"><BellRing className="w-4 h-4 mr-2" />Všeobecná správa</span></SelectItem>
                <SelectItem value="event"><span className="flex items-center"><CalendarClock className="w-4 h-4 mr-2" />Event</span></SelectItem>
                <SelectItem value="payment"><span className="flex items-center"><CreditCard className="w-4 h-4 mr-2" />Platby</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          {context === "event" && (
            <div className="space-y-2">
              <Label>Event</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger data-testid="select-notification-event"><SelectValue placeholder="Vyber event" /></SelectTrigger>
                <SelectContent>
                  {sortedEvents.map(event => (
                    <SelectItem key={event.id} value={String(event.id)}>
                      {event.title} · {format(parseISO(event.startTime), "d. MMM yyyy HH:mm", { locale: sk })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Príjemcovia</Label>
            <Select value={target} onValueChange={value => setTarget(value as NotificationTarget)}>
              <SelectTrigger data-testid="select-notification-target"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všetci aktívni členovia ({activeUsers.length})</SelectItem>
                <SelectItem value="user">Jeden vybraný člen</SelectItem>
                {context === "event" && <SelectItem value="event_unanswered">Členovia bez odpovede na event</SelectItem>}
                {context === "payment" && <SelectItem value="unpaid">Členovia s neuhradenou platbou</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {target === "user" && (
            <div className="space-y-2">
              <Label>Člen</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger data-testid="select-notification-user"><SelectValue placeholder="Vyber člena" /></SelectTrigger>
                <SelectContent>
                  {activeUsers.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notification-title">Nadpis</Label>
            <Input id="notification-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Napr. Nezabudni hlasovať" data-testid="input-notification-title" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-body">Text</Label>
            <Textarea id="notification-body" value={body} onChange={event => setBody(event.target.value)} maxLength={800} rows={4} placeholder="Text správy pre členov" data-testid="input-notification-body" />
            <p className="text-xs text-muted-foreground text-right">{body.length}/800</p>
          </div>

          <Button onClick={submit} disabled={!canSend || sendMutation.isPending} data-testid="button-send-notification">
            <Send className="w-4 h-4 mr-1.5" />{sendMutation.isPending ? "Odosielam..." : "Odoslať notifikáciu"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Každému členovi sa použijú jeho osobné nastavenia. Ak má vypnutý email alebo push, daným kanálom správu nedostane.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
