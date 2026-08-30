import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { eventEndPrecedesStart, localEventTimeToIso } from "@/lib/event-time";
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
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Opponent } from "@shared/schema";

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
  canRespondToAttendance?: boolean;
  matchResult: MatchResult | null;
}

interface MatchPlayerContribution {
  userId: number;
  goals: number;
  assists: number;
  played: boolean;
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
  isPlayerActive: boolean;
  emailVerified: boolean;
}

interface ResultPlayerValue {
  goals: number;
  assists: number;
  played: boolean;
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
  const { lang, t } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EventEditForm>(emptyEditForm);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [teamScore, setTeamScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [resultNotes, setResultNotes] = useState("");
  const [resultPlayers, setResultPlayers] = useState<Record<number, ResultPlayerValue>>({});
   const { data: opponents = [], isLoading: opponentsLoading } = useQuery<Opponent[]>({
      queryKey: ["/api/opponents"],
    });
  const { data: event } = useQuery<EventDetail>({
    queryKey: ["/api/events", id],
  });

  const { data: responses = [], isLoading: responsesLoading } = useQuery<EventResponse[]>({
    queryKey: ["/api/events", id, "responses"],
  });

  const { data: adminUsers = [], isLoading: adminUsersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin",
  });

  const getEligibleResultUserIds = () => {
    const eligibleIds = new Set(event?.matchResult?.players.map(player => player.userId) ?? []);
    adminUsers.forEach(candidate => {
      if (candidate.isActive && candidate.isPlayerActive && candidate.emailVerified) {
        eligibleIds.add(candidate.id);
      }
    });
    return eligibleIds;
  };

  const respondMutation = useMutation({
    mutationFn: (data: { status: string; note?: string }) =>
      apiRequest("POST", `/api/events/${id}/responses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id, "responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("eventDetail.attendanceUpdated") });
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("eventDetail.eventDeleted") });
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
        title: t("eventDetail.eventUpdated"),
        description: updatedEvent.googleSyncWarning,
      });
      setEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t("eventDetail.eventUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const saveResultMutation = useMutation({
    mutationFn: () => {
      const eligibleUserIds = getEligibleResultUserIds();
      return apiRequest("PUT", `/api/events/${id}/result`, {
        teamScore,
        opponentScore,
        notes: resultNotes,
        players: Object.entries(resultPlayers)
          .filter(([userId]) => eligibleUserIds.has(Number(userId)))
          .map(([userId, values]) => ({ userId: Number(userId), goals: values.goals, assists: values.assists, played: values.played })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: t("eventDetail.resultSaved") });
      setResultDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t("eventDetail.resultSaveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteResultMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${id}/result`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({ title: t("eventDetail.resultDeleted") });
      setResultDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t("eventDetail.resultDeleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handleEditSubmit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const endDate = editForm.endDate || editForm.date;
    let startTime: string;
    let endTime: string | null;

    try {
      startTime = localEventTimeToIso(editForm.date, editForm.time);
      endTime = editForm.endTime ? localEventTimeToIso(endDate, editForm.endTime) : null;
    } catch (error) {
      toast({
        title: t("eventDetail.invalidTime"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      return;
    }

    if (eventEndPrecedesStart(startTime, endTime)) {
      toast({
        title: t("eventDetail.invalidTime"),
        description: t("eventDetail.endBeforeStart"),
        variant: "destructive",
      });
      return;
    }

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
    const eligibleUserIds = getEligibleResultUserIds();
    
    // If editing existing result, use existing player stats
    if (event.matchResult) {
      event.matchResult.players.forEach(player => {
        values[player.userId] = { goals: player.goals, assists: player.assists, played: player.played ?? false };
      });
    } else {
      // Pre-populate with players who marked "Going" for attendance
      going.forEach(response => {
        if (eligibleUserIds.has(response.user.id)) {
          values[response.user.id] = { goals: 0, assists: 0, played: true };
        }
      });
    }
    
    setTeamScore(event.matchResult?.teamScore ?? 0);
    setOpponentScore(event.matchResult?.opponentScore ?? 0);
    setResultNotes(event.matchResult?.notes ?? "");
    setResultPlayers(values);
    setResultDialogOpen(true);
  };

  const updateResultPlayer = (userId: number, field: keyof ResultPlayerValue, value: string | boolean) => {
    if (field === "played") {
      setResultPlayers(previous => ({
        ...previous,
        [userId]: {
          goals: previous[userId]?.goals ?? 0,
          assists: previous[userId]?.assists ?? 0,
          played: value as boolean,
        },
      }));
    } else {
      const stringValue = value as string;
      const parsed = Math.max(0, Math.min(100, Number.parseInt(stringValue || "0", 10) || 0));
      setResultPlayers(previous => {
        const updated: Record<number, ResultPlayerValue> = {
          ...previous,
          [userId]: {
            goals: previous[userId]?.goals ?? 0,
            assists: previous[userId]?.assists ?? 0,
            played: previous[userId]?.played ?? false,
            [field]: parsed,
          },
        };
        return updated;
      });
    }
  };

  if (!event) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">{t("common.loading")}</p>
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
    .filter(resultUser => (resultUser.isActive && resultUser.isPlayerActive && resultUser.emailVerified) || existingResultUserIds.has(resultUser.id))
    .sort((first, second) => Number(goingUserIds.has(second.id)) - Number(goingUserIds.has(first.id)) || first.name.localeCompare(second.name, lang === "cz" ? "cs" : lang));
  const canRespondToEvent = event.canRespondToAttendance !== false;
  const isWin = event.matchResult && event.matchResult.teamScore > event.matchResult.opponentScore;
  const isDraw = event.matchResult && event.matchResult.teamScore === event.matchResult.opponentScore;
  const resultLeftName = event.homeAway === "away" ? event.opponent || t("eventDetail.opponentFallback") : "O5MY";
  const resultRightName = event.homeAway === "away" ? "O5MY" : event.opponent || t("eventDetail.opponentFallback");
  const resultLeftScore = event.homeAway === "away" ? event.matchResult?.opponentScore : event.matchResult?.teamScore;
  const resultRightScore = event.homeAway === "away" ? event.matchResult?.teamScore : event.matchResult?.opponentScore;
  const formatFull = (dateStr: string) => {
    try { return format(parseISO(dateStr), "EEEE d. MMMM yyyy 'o' HH:mm", { locale: dateLocale }); } catch { return dateStr; }
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
            <ArrowLeft className="w-4 h-4 mr-1" />{t("common.back")}
          </Button>
        </Link>
        {user?.role === "admin" && (
          <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit-event">
            <Pencil className="w-4 h-4 mr-1" />{t("common.edit")}
          </Button>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={event.type === "match" ? "default" : "secondary"}>
            {event.type === "match" ? "⚽ " + t("eventTypes.match") : event.type === "teambuilding" ? "🎉 " + t("eventTypes.teambuilding") : "🏃 " + t("eventTypes.training")}
          </Badge>
          {event.homeAway && (
            <Badge variant="outline">{event.homeAway === "home" ? t("eventDetail.home") : t("eventDetail.away")}</Badge>
          )}
          {event.source === "google" && (
            <Badge variant="outline">{t("eventDetail.googleSync")}</Badge>
          )}
        </div>
        <h1 className="font-serif text-xl font-bold" data-testid="text-event-title">{event.title}</h1>
        {event.opponent && <p className="text-sm text-muted-foreground mt-1">{t("eventDetail.against", { opponent: event.opponent })}</p>}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CalIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{formatFull(event.startTime)}</p>
              {event.endTime && <p className="text-xs text-muted-foreground">{t("eventDetail.until", { time: format(parseISO(event.endTime), "HH:mm") })}</p>}
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
                <Trophy className="w-4 h-4" />{t("eventDetail.resultTitle")}
              </CardTitle>
              {user?.role === "admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openResultDialog}
                  disabled={adminUsersLoading || responsesLoading}
                  data-testid="button-edit-result"
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  {event.matchResult ? t("common.edit") : t("eventDetail.enterResult")}
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
                    {isWin ? t("matches.win") : isDraw ? t("matches.draw") : t("matches.loss")}
                  </Badge>
                </div>
                {event.matchResult.players.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    {event.matchResult.players.map(player => (
                      <div key={player.userId} className="flex items-center justify-between gap-3 text-sm">
                        <span>{player.user.name}</span>
                        <span className="text-muted-foreground">
                          {player.goals > 0 && `${player.goals} ${player.goals === 1 ? t("eventDetail.goalOne") : t("eventDetail.goalMany")}`}
                          {player.goals > 0 && player.assists > 0 && " · "}
                          {player.assists > 0 && `${player.assists} ${player.assists === 1 ? t("eventDetail.assistOne") : t("eventDetail.assistMany")}`}
                          {player.played && (player.goals > 0 || player.assists > 0 ? " · " : "") && player.played && t("eventDetail.played")}
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
              <p className="text-sm text-muted-foreground">{t("eventDetail.noResultYet")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("eventDetail.myAttendance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canRespondToEvent ? (
            <>
              <div className="flex gap-2" data-testid="attendance-buttons">
                <Button
                  variant={myResponse?.status === "going" ? "default" : "outline"}
                  size="sm"
                  onClick={() => respondMutation.mutate({ status: "going", note })}
                  className="flex-1"
                  data-testid="button-going"
                >
                  <Check className="w-4 h-4 mr-1" />{t("eventDetail.going")}
                </Button>
                <Button
                  variant={myResponse?.status === "maybe" ? "default" : "outline"}
                  size="sm"
                  onClick={() => respondMutation.mutate({ status: "maybe", note })}
                  className="flex-1"
                  data-testid="button-maybe"
                >
                  <Minus className="w-4 h-4 mr-1" />{t("eventDetail.maybe")}
                </Button>
                <Button
                  variant={myResponse?.status === "not_going" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => respondMutation.mutate({ status: "not_going", note })}
                  className="flex-1"
                  data-testid="button-not-going"
                >
                  <X className="w-4 h-4 mr-1" />{t("eventDetail.notGoing")}
                </Button>
              </div>
              <Textarea
                placeholder={t("eventDetail.notePlaceholder", { optional: t("common.optional") })}
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                data-testid="input-attendance-note"
              />
            </>
          ) : (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="inactive-player-match-notice">
              {t("eventDetail.inactivePlayerMatchNotice")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />{t("eventDetail.attendanceCount", { count: responses.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t("eventDetail.goingCount", { count: going.length })}</p>
            <div className="flex flex-wrap gap-1.5">
              {going.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
                  {r.user.name}
                </Badge>
              ))}
              {going.length === 0 && <span className="text-xs text-muted-foreground">{t("eventDetail.nobody")}</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">{t("eventDetail.maybeCount", { count: maybe.length })}</p>
            <div className="flex flex-wrap gap-1.5">
              {maybe.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  {r.user.name}
                </Badge>
              ))}
              {maybe.length === 0 && <span className="text-xs text-muted-foreground">{t("eventDetail.nobody")}</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">{t("eventDetail.notGoingCount", { count: notGoing.length })}</p>
            <div className="flex flex-wrap gap-1.5">
              {notGoing.map(r => (
                <Badge key={r.id} variant="secondary" className="bg-red-500/10 text-red-600 dark:text-red-400">
                  {r.user.name}
                </Badge>
              ))}
              {notGoing.length === 0 && <span className="text-xs text-muted-foreground">{t("eventDetail.nobody")}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{event.matchResult ? t("eventDetail.editResult") : t("eventDetail.enterResult")}</DialogTitle>
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
                <Label htmlFor="result-opponent-score">{event.opponent || t("eventDetail.opponentFallback")}</Label>
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
              <div className="grid grid-cols-[1fr_72px_72px_60px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>{t("eventDetail.player")}</span>
                <span className="text-center">{t("eventDetail.goals")}</span>
                <span className="text-center">{t("eventDetail.assistsShort")}</span>
                <span className="text-center">{t("eventDetail.played")}</span>
              </div>
              <div className="divide-y rounded-md border">
                {resultUsers.map(resultUser => (
                  <div key={resultUser.id} className="grid grid-cols-[1fr_72px_72px_60px] items-center gap-2 p-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{resultUser.name}</p>
                      {goingUserIds.has(resultUser.id) && <p className="text-[11px] text-green-600">{t("eventDetail.confirmedAttendance")}</p>}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={t("eventDetail.goalsAria", { name: resultUser.name })}
                      value={resultPlayers[resultUser.id]?.goals ?? 0}
                      onChange={inputEvent => updateResultPlayer(resultUser.id, "goals", inputEvent.target.value)}
                      className="text-center px-2"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={t("eventDetail.assistsAria", { name: resultUser.name })}
                      value={resultPlayers[resultUser.id]?.assists ?? 0}
                      onChange={inputEvent => updateResultPlayer(resultUser.id, "assists", inputEvent.target.value)}
                      className="text-center px-2"
                    />
                    <input
                      type="checkbox"
                      aria-label={t("eventDetail.playedAria", { name: resultUser.name })}
                      checked={resultPlayers[resultUser.id]?.played ?? false}
                      onChange={inputEvent => updateResultPlayer(resultUser.id, "played", inputEvent.target.checked)}
                      className="w-4 h-4 justify-self-center"
                    />
                  </div>
                ))}
                {resultUsers.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">{t("eventDetail.noActivePlayers")}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("eventDetail.ownGoalsHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="result-notes">{t("calendar.note")}</Label>
              <Textarea
                id="result-notes"
                value={resultNotes}
                onChange={inputEvent => setResultNotes(inputEvent.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t("eventDetail.resultNotesPlaceholder")}
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
                      if (confirm(t("eventDetail.deleteResultConfirm"))) deleteResultMutation.mutate();
                    }}
                    data-testid="button-delete-result"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />{t("eventDetail.deleteResult")}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setResultDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={saveResultMutation.isPending} data-testid="button-save-result">
                  {saveResultMutation.isPending ? t("common.saving") : t("eventDetail.saveResult")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("eventDetail.editEvent")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("calendar.type")}</Label>
              <Select value={editForm.type} onValueChange={type => setEditForm(previous => ({ ...previous, type }))}>
                <SelectTrigger data-testid="edit-select-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">{t("eventTypes.training")}</SelectItem>
                  <SelectItem value="match">{t("eventTypes.match")}</SelectItem>
                  <SelectItem value="teambuilding">{t("eventTypes.teambuilding")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-title">{t("calendar.name")}</Label>
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
                <Label htmlFor="edit-date">{t("calendar.startDate")}</Label>
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
                <Label htmlFor="edit-time">{t("calendar.startTime")}</Label>
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
                <Label htmlFor="edit-end-date">{t("calendar.endDate")}</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={editForm.endDate}
                  onChange={inputEvent => setEditForm(previous => ({ ...previous, endDate: inputEvent.target.value }))}
                  data-testid="edit-input-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-time">{t("eventDetail.editEndTime")}</Label>
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
              <Label htmlFor="edit-location">{t("calendar.location")}</Label>
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
                  <Label htmlFor="edit-opponent">{t("calendar.opponent")}</Label>

                  <Select
                    value={editForm.opponent}
                    onValueChange={(opponent) =>
                      setEditForm((previous) => ({
                        ...previous,
                        opponent,
                      }))
                    }
                    disabled={opponentsLoading || opponents.length === 0}
                  >
                    <SelectTrigger
                      id="edit-opponent"
                      data-testid="edit-select-opponent"
                    >
                      <SelectValue placeholder={t("eventDetail.selectOpponent")} />
                    </SelectTrigger>

                    <SelectContent>
                      {opponents.map((opponent) => (
                        <SelectItem
                          key={opponent.id}
                          value={opponent.name}
                        >
                          {opponent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("eventDetail.homeAway")}</Label>

                  <Select
                    value={editForm.homeAway}
                    onValueChange={(homeAway) =>
                      setEditForm((previous) => ({
                        ...previous,
                        homeAway,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="edit-select-home-away">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="home">{t("eventDetail.home")}</SelectItem>
                      <SelectItem value="away">{t("eventDetail.away")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("calendar.note")}</Label>
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
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-event">
                {updateMutation.isPending ? t("common.saving") : t("eventDetail.saveChanges")}
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
          onClick={() => { if (confirm(t("eventDetail.deleteEventConfirm"))) deleteMutation.mutate(); }}
          data-testid="button-delete-event"
        >
          <Trash2 className="w-4 h-4 mr-1" />{t("eventDetail.deleteEvent")}
        </Button>
      )}
    </div>
  );
}
