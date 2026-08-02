import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Calendar as CalIcon, Check, X, Minus, Users, Trash2, Pencil } from "lucide-react";
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

interface EventEditForm {
  type: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  opponent: string;
  homeAway: string;
}

const emptyEditForm: EventEditForm = {
  type: "training",
  title: "",
  description: "",
  location: "",
  date: "",
  time: "",
  endDate: "",
  endTime: "",
  opponent: "",
  homeAway: "home",
};

function getDateInputParts(value?: string | null) {
  if (!value) return { date: "", time: "" };
  try {
    const parsed = parseISO(value);
    return {
      date: format(parsed, "yyyy-MM-dd"),
      time: format(parsed, "HH:mm"),
    };
  } catch {
    return { date: "", time: "" };
  }
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EventEditForm>(emptyEditForm);

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
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
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

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("PUT", `/api/events/${id}`, data);
      return response.json() as Promise<EventDetail & { googleSyncWarning?: string }>;
    },
    onSuccess: updatedEvent => {
      queryClient.setQueryData(["/api/events", id], updatedEvent);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Event aktualizovaný",
        description: updatedEvent.googleSyncWarning,
      });
      setEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Event sa nepodarilo upraviť", description: error.message, variant: "destructive" });
    },
  });

  const handleEditSubmit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const startTime = `${editForm.date}T${editForm.time}:00`;
    const endDate = editForm.endDate || editForm.date;
    const endTime = editForm.endTime ? `${endDate}T${editForm.endTime}:00` : null;

    updateMutation.mutate({
      type: editForm.type,
      title: editForm.title,
      description: editForm.description || null,
      location: editForm.location || null,
      startTime,
      endTime,
      opponent: editForm.type === "match" ? editForm.opponent || null : null,
      homeAway: editForm.type === "match" ? editForm.homeAway : null,
    });
  };

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

  const openEditDialog = () => {
    const start = getDateInputParts(event.startTime);
    const end = getDateInputParts(event.endTime);
    setEditForm({
      type: event.type,
      title: event.title,
      description: event.description || "",
      location: event.location || "",
      date: start.date,
      time: start.time,
      endDate: end.date || start.date,
      endTime: end.time,
      opponent: event.opponent || "",
      homeAway: event.homeAway === "away" ? "away" : "home",
    });
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/calendar">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />Späť
          </Button>
        </Link>
        {user?.role === "admin" && (
          <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit-event">
            <Pencil className="w-4 h-4 mr-1" />Upraviť
          </Button>
        )}
      </div>

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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upraviť event</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={editForm.type} onValueChange={type => setEditForm(previous => ({ ...previous, type }))}>
                <SelectTrigger data-testid="edit-select-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Tréning</SelectItem>
                  <SelectItem value="match">Zápas</SelectItem>
                  <SelectItem value="teambuilding">Team building</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-title">Názov</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={inputEvent => setEditForm(previous => ({ ...previous, title: inputEvent.target.value }))}
                required
                data-testid="edit-input-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Dátum začiatku</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.date}
                  onChange={inputEvent => setEditForm(previous => ({
                    ...previous,
                    date: inputEvent.target.value,
                    endDate: previous.endDate || inputEvent.target.value,
                  }))}
                  required
                  data-testid="edit-input-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Čas začiatku</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editForm.time}
                  onChange={inputEvent => setEditForm(previous => ({ ...previous, time: inputEvent.target.value }))}
                  required
                  data-testid="edit-input-time"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-end-date">Dátum konca</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={editForm.endDate}
                  onChange={inputEvent => setEditForm(previous => ({ ...previous, endDate: inputEvent.target.value }))}
                  data-testid="edit-input-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-time">Čas konca</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={editForm.endTime}
                  onChange={inputEvent => setEditForm(previous => ({ ...previous, endTime: inputEvent.target.value }))}
                  data-testid="edit-input-end-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-location">Miesto</Label>
              <Input
                id="edit-location"
                value={editForm.location}
                onChange={inputEvent => setEditForm(previous => ({ ...previous, location: inputEvent.target.value }))}
                data-testid="edit-input-location"
              />
            </div>

            {editForm.type === "match" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-opponent">Súper</Label>
                  <Input
                    id="edit-opponent"
                    value={editForm.opponent}
                    onChange={inputEvent => setEditForm(previous => ({ ...previous, opponent: inputEvent.target.value }))}
                    data-testid="edit-input-opponent"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domáci/Vypravení</Label>
                  <Select value={editForm.homeAway} onValueChange={homeAway => setEditForm(previous => ({ ...previous, homeAway }))}>
                    <SelectTrigger data-testid="edit-select-home-away"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Domáci</SelectItem>
                      <SelectItem value="away">Vypravení</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-description">Poznámka</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={inputEvent => setEditForm(previous => ({ ...previous, description: inputEvent.target.value }))}
                rows={3}
                data-testid="edit-input-description"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Zrušiť
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-event">
                {updateMutation.isPending ? "Ukladám..." : "Uložiť zmeny"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
