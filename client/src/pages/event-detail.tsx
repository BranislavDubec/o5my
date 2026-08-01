import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Clock, Calendar as CalIcon, Check, X, Minus, Users, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";
import { useState } from "react";

interface EventDetail {
  id: number;
  type: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string | null;
  opponent: string | null;
  homeAway: string | null;
  source?: string | null;
}

interface EventResponse {
  id: number;
  status: string;
  note: string | null;
  user: { id: number; name: string };
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const { data: event } = useQuery<EventDetail>({
    queryKey: ["/api/events", id],
  });

  const { data: responses = [] } = useQuery<EventResponse[]>({
    queryKey: ["/api/events", id, "responses"],
  });

  const respondMutation = useMutation({
    mutationFn: (data: { status: string; note?: string }) =>
      apiRequest("POST", `/api/events/${id}/responses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id, "responses"] });
      toast({ title: "Účasť aktualizovaná" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event zmazaný" });
      window.location.hash = "#/calendar";
    },
  });

  if (!event) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Načítavam...</p>
      </div>
    );
  }

  const myResponse = responses.find(r => r.user.id === user?.id);
  const going = responses.filter(r => r.status === "going");
  const notGoing = responses.filter(r => r.status === "not_going");
  const maybe = responses.filter(r => r.status === "maybe");

  const formatFull = (dateStr: string) => {
    try { return format(parseISO(dateStr), "EEEE d. MMMM yyyy 'o' HH:mm", { locale: sk }); } catch { return dateStr; }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/calendar">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />Späť
        </Button>
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={event.type === "match" ? "default" : "secondary"}>
            {event.type === "match" ? "⚽ Zápas" : event.type === "teambuilding" ? "🎉 Team building" : "🏃 Tréning"}
          </Badge>
          {event.homeAway && (
            <Badge variant="outline">{event.homeAway === "home" ? "Domáci" : "Vypravení"}</Badge>
          )}
          {event.source === "google" && (
            <Badge variant="outline">Google sync</Badge>
          )}
        </div>
        <h1 className="font-serif text-xl font-bold" data-testid="text-event-title">{event.title}</h1>
        {event.opponent && <p className="text-sm text-muted-foreground mt-1">Proti: {event.opponent}</p>}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CalIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{formatFull(event.startTime)}</p>
              {event.endTime && <p className="text-xs text-muted-foreground">do {format(parseISO(event.endTime), "HH:mm")}</p>}
            </div>
          </div>
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm">{event.location}</p>
            </div>
          )}
          {event.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tvoja účasť</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2" data-testid="attendance-buttons">
            <Button
              variant={myResponse?.status === "going" ? "default" : "outline"}
              size="sm"
              onClick={() => respondMutation.mutate({ status: "going", note })}
              className="flex-1"
              data-testid="button-going"
            >
              <Check className="w-4 h-4 mr-1" />Idem
            </Button>
            <Button
              variant={myResponse?.status === "maybe" ? "default" : "outline"}
              size="sm"
              onClick={() => respondMutation.mutate({ status: "maybe", note })}
              className="flex-1"
              data-testid="button-maybe"
            >
              <Minus className="w-4 h-4 mr-1" />Možno
            </Button>
            <Button
              variant={myResponse?.status === "not_going" ? "destructive" : "outline"}
              size="sm"
              onClick={() => respondMutation.mutate({ status: "not_going", note })}
              className="flex-1"
              data-testid="button-not-going"
            >
              <X className="w-4 h-4 mr-1" />Neidem
            </Button>
          </div>
          <Textarea
            placeholder="Poznámka (voliteľné)"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            data-testid="input-attendance-note"
          />
        </CardContent>
      </Card>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />Účasť ({responses.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Idú ({going.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {going.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
                  {r.user.name}
                </Badge>
              ))}
              {going.length === 0 && <span className="text-xs text-muted-foreground">Nikto</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">Možno ({maybe.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {maybe.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  {r.user.name}
                </Badge>
              ))}
              {maybe.length === 0 && <span className="text-xs text-muted-foreground">Nikto</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Nejdú ({notGoing.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {notGoing.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-red-500/10 text-red-600 dark:text-red-400">
                  {r.user.name}
                </Badge>
              ))}
              {notGoing.length === 0 && <span className="text-xs text-muted-foreground">Nikto</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {user?.role === "admin" && (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => { if (confirm("Zmazať tento event?")) deleteMutation.mutate(); }}
          data-testid="button-delete-event"
        >
          <Trash2 className="w-4 h-4 mr-1" />Zmazať event
        </Button>
      )}
    </div>
  );
}
