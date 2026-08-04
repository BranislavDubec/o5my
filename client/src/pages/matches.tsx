import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";
import { CalendarDays, Clock, MapPin, Plus, RefreshCw, Swords, Trophy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getAttendanceBorderClass, type AttendanceStatus } from "@/lib/event-attendance";
import { eventEndPrecedesStart, localEventTimeToIso } from "@/lib/event-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Opponent } from "@shared/schema";

interface MatchResultSummary {
  teamScore: number;
  opponentScore: number;
}

interface MatchEvent {
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
  attendanceStatus?: AttendanceStatus;
  matchResult?: MatchResultSummary | null;
}

interface MatchForm {
  opponent: string;
  homeAway: "home" | "away";
  date: string;
  time: string;
  endTime: string;
  location: string;
  description: string;
}

const emptyForm: MatchForm = {
  opponent: "",
  homeAway: "home",
  date: "",
  time: "",
  endTime: "",
  location: "",
  description: "",
};

function formatMatchDate(value: string) {
  try {
    return format(parseISO(value), "EEEE d. MMMM yyyy", { locale: sk });
  } catch {
    return value;
  }
}

function formatMatchTime(value: string) {
  try {
    return format(parseISO(value), "HH:mm");
  } catch {
    return "";
  }
}

function outcomeLabel(result: MatchResultSummary) {
  if (result.teamScore > result.opponentScore) return { label: "Výhra", className: "bg-green-500/15 text-green-700 dark:text-green-300" };
  if (result.teamScore === result.opponentScore) return { label: "Remíza", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return { label: "Prehra", className: "bg-red-500/15 text-red-700 dark:text-red-300" };
}

export default function MatchesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MatchForm>(emptyForm);

  const { data: events = [], isLoading } = useQuery<MatchEvent[]>({
    queryKey: ["/api/events"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const opponent = form.opponent.trim();
      const title = form.homeAway === "home"
        ? `Zápas: O5MY vs ${opponent}`
        : `Zápas: ${opponent} vs O5MY`;
      const startTime = localEventTimeToIso(form.date, form.time);
      const endTime = form.endTime ? localEventTimeToIso(form.date, form.endTime) : undefined;
      if (eventEndPrecedesStart(startTime, endTime)) {
        throw new Error("Koniec zápasu nemôže byť pred jeho začiatkom");
      }
      const response = await apiRequest("POST", "/api/events", {
        type: "match",
        title,
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startTime,
        endTime,
        opponent,
        homeAway: form.homeAway,
      });
      return response.json() as Promise<{ googleSyncWarning?: string }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Zápas vytvorený",
        description: result.googleSyncWarning || "Zápas bol pridaný aj do Google Calendar.",
      });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (error: Error) => {
      toast({ title: "Zápas sa nepodarilo vytvoriť", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/calendar/sync", {});
      return response.json() as Promise<{ created?: number; updated?: number }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Kalendár synchronizovaný",
        description: `${result.created ?? 0} nových, ${result.updated ?? 0} aktualizovaných udalostí`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Synchronizácia zlyhala", description: error.message, variant: "destructive" });
    },
  });

  const matches = events
    .filter(event => event.type === "match")
    .sort((first, second) => new Date(first.startTime).getTime() - new Date(second.startTime).getTime());
  const now = Date.now();
  const upcoming = matches.filter(match => new Date(match.startTime).getTime() >= now);
  const played = matches.filter(match => new Date(match.startTime).getTime() < now).reverse();
  const completed = matches.filter(match => match.matchResult);
  const wins = completed.filter(match => match.matchResult!.teamScore > match.matchResult!.opponentScore).length;
  const goals = completed.reduce((sum, match) => sum + (match.matchResult?.teamScore ?? 0), 0);
  const { data: opponents = [], isLoading: opponentsLoading } = useQuery<Opponent[]>({
    queryKey: ["/api/opponents"],
  });
  const MatchCard = ({ match }: { match: MatchEvent }) => {
    const resultOutcome = match.matchResult ? outcomeLabel(match.matchResult) : null;
    return (
      <Link href={`/events/${match.id}`}>
        <Card
          className={`hover-elevate cursor-pointer ${getAttendanceBorderClass(match.attendanceStatus)}`}
          data-testid={`match-${match.id}`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-14 shrink-0 rounded-lg bg-primary/10 py-2 text-center text-primary">
                <p className="text-xl font-bold leading-none">{formatMatchTime(match.startTime)}</p>
                <p className="mt-1 text-[10px] uppercase">čas</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">O5MY vs {match.opponent || "Súper"}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {match.homeAway === "away" ? "Vonku" : "Doma"}tc
                  </Badge>
                  {match.source === "google" && <Badge variant="outline" className="text-[10px]">Google</Badge>}
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground capitalize">
                  <CalendarDays className="h-3.5 w-3.5" />{formatMatchDate(match.startTime)}
                </p>
                {match.location && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />{match.location}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {match.matchResult ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{match.matchResult.teamScore}:{match.matchResult.opponentScore}</p>
                    <Badge className={`mt-1 border-0 text-[10px] ${resultOutcome?.className}`}>{resultOutcome?.label}</Badge>
                  </>
                ) : (
                  <Badge variant="secondary">Naplánovaný</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">Zápasy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Termíny, súperi a výsledky na jednom mieste</p>
        </div>
        {user?.role === "admin" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`mr-1 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Synchronizujem..." : "Sync Google"}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-match"><Plus className="mr-1 h-4 w-4" />Pridať zápas</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nový zápas</DialogTitle></DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={submitEvent => {
                    submitEvent.preventDefault();
                    createMutation.mutate();
                  }}
                >
                  <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                          <Label htmlFor="match-opponent">Súper</Label>

                          <Select
                            value={form.opponent}
                            onValueChange={opponent =>
                              setForm(previous => ({
                                ...previous,
                                opponent,
                              }))
                            }
                            disabled={opponentsLoading || opponents.length === 0}
                          >
                            <SelectTrigger
                              id="match-opponent"
                              data-testid="select-match-opponent"
                            >
                              <SelectValue
                                placeholder={
                                  opponentsLoading
                                    ? "Načítavam súperov..."
                                    : opponents.length === 0
                                      ? "Žiadni súperi"
                                      : "Vyber súpera"
                                }
                              />
                            </SelectTrigger>

                            <SelectContent>
                              {opponents.map(opponent => (
                                <SelectItem
                                  key={opponent.id}
                                  value={opponent.name}
                                >
                                  {opponent.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {opponents.length === 0 && !opponentsLoading && (
                            <p className="text-xs text-muted-foreground">
                              Najprv pridaj súpera v sekcii Súperi.
                            </p>
                          )}
                        </div>
                    <div className="space-y-2">
                      <Label>Miesto zápasu</Label>
                      <Select value={form.homeAway} onValueChange={(homeAway: "home" | "away") => setForm(previous => ({ ...previous, homeAway }))}>
                        <SelectTrigger data-testid="select-match-home-away"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="home">Doma</SelectItem>
                          <SelectItem value="away">Vonku</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="match-date">Dátum</Label>
                      <Input
                        id="match-date"
                        type="date"
                        value={form.date}
                        onChange={inputEvent => setForm(previous => ({ ...previous, date: inputEvent.target.value }))}
                        required
                        data-testid="input-match-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="match-time">Začiatok</Label>
                      <Input
                        id="match-time"
                        type="time"
                        value={form.time}
                        onChange={inputEvent => setForm(previous => ({ ...previous, time: inputEvent.target.value }))}
                        required
                        data-testid="input-match-time"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="match-end-time">Koniec</Label>
                      <Input
                        id="match-end-time"
                        type="time"
                        value={form.endTime}
                        onChange={inputEvent => setForm(previous => ({ ...previous, endTime: inputEvent.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="match-location">Hala / miesto</Label>
                      <Input
                        id="match-location"
                        value={form.location}
                        onChange={inputEvent => setForm(previous => ({ ...previous, location: inputEvent.target.value }))}
                        placeholder="Názov haly alebo adresa"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="match-description">Poznámka</Label>
                    <Textarea
                      id="match-description"
                      value={form.description}
                      onChange={inputEvent => setForm(previous => ({ ...previous, description: inputEvent.target.value }))}
                      rows={3}
                    />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5" />Po vytvorení sa zápas automaticky odošle do Google Calendar.
                  </p>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-match">
                      {createMutation.isPending ? "Vytváram..." : "Vytvoriť zápas"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="flex flex-col items-center p-4 text-center"><Swords className="mb-2 h-5 w-5 text-primary" /><span className="text-xl font-bold">{completed.length}</span><span className="text-xs text-muted-foreground">Odohrané</span></CardContent></Card>
        <Card><CardContent className="flex flex-col items-center p-4 text-center"><Trophy className="mb-2 h-5 w-5 text-amber-500" /><span className="text-xl font-bold">{wins}</span><span className="text-xs text-muted-foreground">Výhry</span></CardContent></Card>
        <Card><CardContent className="flex flex-col items-center p-4 text-center"><Clock className="mb-2 h-5 w-5 text-primary" /><span className="text-xl font-bold">{goals}</span><span className="text-xs text-muted-foreground">Góly O5MY</span></CardContent></Card>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Načítavam zápasy...</CardContent></Card>
      ) : matches.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><Swords className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">Zatiaľ nie je naplánovaný žiadny zápas.</p></CardContent></Card>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nadchádzajúce ({upcoming.length})</h2>
            {upcoming.length > 0
              ? upcoming.map(match => <MatchCard key={match.id} match={match} />)
              : <p className="rounded-lg border p-4 text-sm text-muted-foreground">Žiadny nadchádzajúci zápas.</p>}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Odohrané ({played.length})</h2>
            {played.length > 0
              ? played.map(match => <MatchCard key={match.id} match={match} />)
              : <p className="rounded-lg border p-4 text-sm text-muted-foreground">Zatiaľ nebol odohraný žiadny zápas.</p>}
          </section>
        </>
      )}
    </div>
  );
}
