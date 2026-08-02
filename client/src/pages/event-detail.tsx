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
import { ArrowLeft, MapPin, Calendar as CalIcon, Check, X, Minus, Users, Trash2, Pencil, Trophy } from "lucide-react";
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
  matchResult: MatchResult | null;
}

interface MatchPlayerContribution {
  userId: number;
  goals: number;
  assists: number;
  user: { id: number; name: string };
}

interface MatchResult {
  id: number;
  teamScore: number;
  opponentScore: number;
  notes: string | null;
  players: MatchPlayerContribution[];
}

interface AdminUser {
  id: number;
  name: string;
  isActive: boolean;
  emailVerified: boolean;
}

interface ResultPlayerValue {
  goals: number;
  assists: number;
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
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [teamScore, setTeamScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [resultNotes, setResultNotes] = useState("");
  const [resultPlayers, setResultPlayers] = useState<Record<number, ResultPlayerValue>>({});

  const { data: event } = useQuery<EventDetail>({
    queryKey: ["/api/events", id],
  });

  const { data: responses = [] } = useQuery<EventResponse[]>({
    queryKey: ["/api/events", id, "responses"],
  });

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin",
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

  const saveResultMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/events/${id}/result`, {
      teamScore,
      opponentScore,
      notes: resultNotes,
      players: Object.entries(resultPlayers)
        .map(([userId, values]) => ({ userId: Number(userId), ...values }))
        .filter(player => player.goals > 0 || player.assists > 0),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: "Výsledok uložený" });
      setResultDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Výsledok sa nepodarilo uložiť", description: error.message, variant: "destructive" });
    },
  });

  const deleteResultMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${id}/result`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: "Výsledok zmazaný" });
      setResultDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Výsledok sa nepodarilo zmazať", description: error.message, variant: "destructive" });
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

  const openResultDialog = () => {
    if (!event) return;
    const values: Record<number, ResultPlayerValue> = {};
    event.matchResult?.players.forEach(player => {
      values[player.userId] = { goals: player.goals, assists: player.assists };
    });
    setTeamScore(event.matchResult?.teamScore ?? 0);
    setOpponentScore(event.matchResult?.opponentScore ?? 0);
    setResultNotes(event.matchResult?.notes ?? "");
    setResultPlayers(values);
    setResultDialogOpen(true);
  };

  const updateResultPlayer = (userId: number, field: keyof ResultPlayerValue, value: string) => {
    const parsed = Math.max(0, Math.min(100, Number.parseInt(value || "0", 10) || 0));
    setResultPlayers(previous => ({
      ...previous,
      [userId]: {
        goals: previous[userId]?.goals ?? 0,
        assists: previous[userId]?.assists ?? 0,
        [field]: parsed,
      },
    }));
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
  const goingUserIds = new Set(going.map(response => response.user.id));
  const existingResultUserIds = new Set(event.matchResult?.players.map(player => player.userId) ?? []);
  const resultUsers = adminUsers
    .filter(resultUser => (resultUser.isActive && resultUser.emailVerified) || existingResultUserIds.has(resultUser.id))
    .sort((first, second) => Number(goingUserIds.has(second.id)) - Number(goingUserIds.has(first.id)) || first.name.localeCompare(second.name, "sk"));
  const isWin = event.matchResult && event.matchResult.teamScore > event.matchResult.opponentScore;
  const isDraw = event.matchResult && event.matchResult.teamScore === event.matchResult.opponentScore;
  const resultLeftName = event.homeAway === "away" ? event.opponent || "Súper" : "O5MY";
  const resultRightName = event.homeAway === "away" ? "O5MY" : event.opponent || "Súper";
  const resultLeftScore = event.homeAway === "away" ? event.matchResult?.opponentScore : event.matchResult?.teamScore;
  const resultRightScore = event.homeAway === "away" ? event.matchResult?.teamScore : event.matchResult?.opponentScore;

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

      {event.type === "match" && (
        <Card data-testid="card-match-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4" />Výsledok zápasu
              </CardTitle>
              {user?.role === "admin" && (
                <Button variant="outline" size="sm" onClick={openResultDialog} data-testid="button-edit-result">
                  <Pencil className="w-4 h-4 mr-1" />
                  {event.matchResult ? "Upraviť" : "Zapísať výsledok"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {event.matchResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                  <p className="font-semibold truncate">{resultLeftName}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold tabular-nums">{resultLeftScore}</span>
                    <span className="text-xl text-muted-foreground">:</span>
                    <span className="text-3xl font-bold tabular-nums">{resultRightScore}</span>
                  </div>
                  <p className="font-semibold truncate">{resultRightName}</p>
                </div>
                <div className="flex justify-center">
                  <Badge variant={isWin ? "default" : "secondary"}>
                    {isWin ? "Výhra" : isDraw ? "Remíza" : "Prehra"}
                  </Badge>
                </div>
                {event.matchResult.players.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    {event.matchResult.players.map(player => (
                      <div key={player.userId} className="flex items-center justify-between gap-3 text-sm">
                        <span>{player.user.name}</span>
                        <span className="text-muted-foreground">
                          {player.goals > 0 && `${player.goals} ${player.goals === 1 ? "gól" : "góly"}`}
                          {player.goals > 0 && player.assists > 0 && " · "}
                          {player.assists > 0 && `${player.assists} ${player.assists === 1 ? "asistencia" : "asistencie"}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {event.matchResult.notes && (
                  <p className="pt-3 border-t text-sm text-muted-foreground whitespace-pre-wrap">{event.matchResult.notes}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Výsledok zatiaľ nie je zapísaný.</p>
            )}
          </CardContent>
        </Card>
      )}

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

      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{event.matchResult ? "Upraviť výsledok" : "Zapísať výsledok"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={submitEvent => {
              submitEvent.preventDefault();
              saveResultMutation.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="result-team-score">O5MY</Label>
                <Input
                  id="result-team-score"
                  type="number"
                  min={0}
                  max={100}
                  value={teamScore}
                  onChange={inputEvent => setTeamScore(Math.max(0, Math.min(100, Number(inputEvent.target.value) || 0)))}
                  className="text-center text-lg font-bold"
                  data-testid="input-team-score"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-opponent-score">{event.opponent || "Súper"}</Label>
                <Input
                  id="result-opponent-score"
                  type="number"
                  min={0}
                  max={100}
                  value={opponentScore}
                  onChange={inputEvent => setOpponentScore(Math.max(0, Math.min(100, Number(inputEvent.target.value) || 0)))}
                  className="text-center text-lg font-bold"
                  data-testid="input-opponent-score"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>Hráč</span>
                <span className="text-center">Góly</span>
                <span className="text-center">Asist.</span>
              </div>
              <div className="divide-y rounded-md border">
                {resultUsers.map(resultUser => (
                  <div key={resultUser.id} className="grid grid-cols-[1fr_72px_72px] items-center gap-2 p-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{resultUser.name}</p>
                      {goingUserIds.has(resultUser.id) && <p className="text-[11px] text-green-600">Potvrdil účasť</p>}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Góly – ${resultUser.name}`}
                      value={resultPlayers[resultUser.id]?.goals ?? 0}
                      onChange={inputEvent => updateResultPlayer(resultUser.id, "goals", inputEvent.target.value)}
                      className="text-center px-2"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Asistencie – ${resultUser.name}`}
                      value={resultPlayers[resultUser.id]?.assists ?? 0}
                      onChange={inputEvent => updateResultPlayer(resultUser.id, "assists", inputEvent.target.value)}
                      className="text-center px-2"
                    />
                  </div>
                ))}
                {resultUsers.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">Nie sú dostupní žiadni aktívni hráči.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Nevyplnené góly môžu predstavovať vlastné góly súpera.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="result-notes">Poznámka</Label>
              <Textarea
                id="result-notes"
                value={resultNotes}
                onChange={inputEvent => setResultNotes(inputEvent.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Krátke zhodnotenie zápasu..."
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <div>
                {event.matchResult && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    disabled={deleteResultMutation.isPending}
                    onClick={() => {
                      if (confirm("Zmazať výsledok a odpočítať jeho štatistiky?")) deleteResultMutation.mutate();
                    }}
                    data-testid="button-delete-result"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />Zmazať výsledok
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setResultDialogOpen(false)}>Zrušiť</Button>
                <Button type="submit" disabled={saveResultMutation.isPending} data-testid="button-save-result">
                  {saveResultMutation.isPending ? "Ukladám..." : "Uložiť výsledok"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
