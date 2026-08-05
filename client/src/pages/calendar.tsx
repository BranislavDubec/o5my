import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, MapPin, Clock, Filter, RefreshCw } from "lucide-react";
import { getAttendanceBorderClass, type AttendanceStatus } from "@/lib/event-attendance";
import { eventEndPrecedesStart, localEventTimeToIso } from "@/lib/event-time";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";

interface EventItem {
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
  matchResult?: { teamScore: number; opponentScore: number } | null;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "match" | "training" | "teambuilding">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "training",
    title: "",
    description: "",
    location: "",
    date: "",
    endDate: "",
    time: "",
    endTime: "",
    opponent: "",
    homeAway: "home",
  });

  const { data: events = [] } = useQuery<EventItem[]>({
    queryKey: ["/api/events"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("calendar.eventCreated") });
      setDialogOpen(false);
      setFormData({ type: "training", title: "", description: "", location: "", date: "", endDate: "", time: "", endTime: "", opponent: "", homeAway: "home" });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/calendar/sync", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: t("calendar.syncSuccess"),
        description: t("calendar.syncSummary", { created: data.created ?? 0, updated: data.updated ?? 0 }),
      });
    },
    onError: (err: any) => toast({ title: t("calendar.syncFailed"), description: err.message, variant: "destructive" }),
  });

  const filteredEvents = events.filter(e => filter === "all" || e.type === filter);
  const now = new Date();
  const upcoming = filteredEvents.filter(e => new Date(e.startTime) >= now);
  const past = filteredEvents.filter(e => new Date(e.startTime) < now).reverse();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startDate = formData.date;
    const endDate = formData.endDate || startDate;
    let startTime: string;
    let endTime: string | null;

    try {
      startTime = localEventTimeToIso(startDate, formData.time);
      endTime = formData.endTime ? localEventTimeToIso(endDate, formData.endTime) : null;
    } catch (error) {
      toast({
        title: t("calendar.invalidTime"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      return;
    }

    if (eventEndPrecedesStart(startTime, endTime)) {
      toast({
        title: t("calendar.invalidTime"),
        description: t("calendar.endBeforeStart"),
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      type: formData.type,
      title: formData.title,
      description: formData.description || undefined,
      location: formData.location || undefined,
      startTime,
      endTime,
      opponent: formData.type === "match" ? formData.opponent || undefined : undefined,
      homeAway: formData.type === "match" ? formData.homeAway : undefined,
    });
  };

  const formatEventDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), "EEEE d. MMMM yyyy", { locale: dateLocale }); } catch { return dateStr; }
  };
  const formatEventTime = (dateStr: string) => {
    try { return format(parseISO(dateStr), "HH:mm"); } catch { return ""; }
  };

  const EventCard = ({ event }: { event: EventItem }) => {
    const typeLabel = event.type === "match" ? t("eventTypes.match") : event.type === "teambuilding" ? t("eventTypes.teambuilding") : t("eventTypes.training");
    const icon = event.type === "match" ? "⚽" : event.type === "teambuilding" ? "🎉" : "🏃";
    const colorClass = event.type === "match"
      ? "bg-primary/15 text-primary"
      : event.type === "teambuilding"
        ? "bg-purple-500/15 text-purple-500"
        : "bg-blue-500/15 text-blue-500";

    return (
      <Link href={`/events/${event.id}`} key={event.id}>
        <Card
          className={`hover-elevate cursor-pointer transition-shadow ${getAttendanceBorderClass(event.attendanceStatus)}`}
          data-attendance-status={event.attendanceStatus || "unanswered"}
          data-testid={`card-event-${event.id}`}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center shrink-0 ${colorClass}`}>
              <span className="text-base leading-none">{icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm truncate">{event.title}</p>
                <Badge variant={event.type === "match" ? "default" : "secondary"} className="text-xs shrink-0">
                  {typeLabel}
                </Badge>
                {event.source === "google" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">Google</Badge>
                )}
                {event.matchResult && (
                  <Badge variant="outline" className="text-xs shrink-0 tabular-nums" data-testid={`result-event-${event.id}`}>
                    {t("calendar.result", { teamScore: event.matchResult.teamScore, opponentScore: event.matchResult.opponentScore })}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatEventTime(event.startTime)}</span>
                {event.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{event.location}</span>}
                {event.opponent && <span className="truncate">vs {event.opponent}</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">{t("calendar.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("calendar.subtitle")}</p>
        </div>
        {user?.role === "admin" && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-google"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                {syncMutation.isPending ? t("calendar.syncing") : t("calendar.sync")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("calendar.syncHint")}</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-event"><Plus className="w-4 h-4 mr-1" />{t("calendar.add")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("calendar.newEvent")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("calendar.type")}</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                      <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="training">{t("eventTypes.training")}</SelectItem>
                        <SelectItem value="match">{t("eventTypes.match")}</SelectItem>
                        <SelectItem value="teambuilding">{t("eventTypes.teambuilding")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">{t("calendar.name")}</Label>
                    <Input id="title" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required placeholder={t("calendar.namePlaceholder")} data-testid="input-title" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="date">{t("calendar.startDate")}</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData(prev => ({ ...prev, date: e.target.value, endDate: prev.endDate || e.target.value }))}
                        required
                        data-testid="input-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">{t("calendar.startTime")}</Label>
                      <Input id="time" type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} required data-testid="input-time" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="endDate">{t("calendar.endDate")}</Label>
                      <Input id="endDate" type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} data-testid="input-end-date" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endTime">{t("calendar.endTime", { optional: t("common.optional") })}</Label>
                      <Input id="endTime" type="time" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} data-testid="input-end-time" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">{t("calendar.location")}</Label>
                    <Input id="location" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder={t("calendar.locationPlaceholder")} data-testid="input-location" />
                  </div>
                  {formData.type === "match" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="opponent">{t("calendar.opponent")}</Label>
                        <Input id="opponent" value={formData.opponent} onChange={e => setFormData({ ...formData, opponent: e.target.value })} placeholder={t("calendar.opponentPlaceholder")} data-testid="input-opponent" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("calendar.homeAway")}</Label>
                        <Select value={formData.homeAway} onValueChange={v => setFormData({ ...formData, homeAway: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="home">{t("calendar.home")}</SelectItem>
                            <SelectItem value="away">{t("calendar.away")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="description">{t("calendar.note")}</Label>
                    <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} data-testid="input-description" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-event">
                      {createMutation.isPending ? t("calendar.creating") : t("calendar.create")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {(["all", "match", "training", "teambuilding"] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === "all" ? t("calendar.all") : f === "match" ? t("calendar.matches") : f === "teambuilding" ? t("eventTypes.teambuilding") : t("calendar.trainings")}
          </Button>
        ))}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("calendar.upcomingSection")}</h2>
          <div className="space-y-2">
            {upcoming.map(event => (
              <div key={event.id}>
                <p className="text-xs text-muted-foreground mb-1 px-1">{formatEventDate(event.startTime)}</p>
                <EventCard event={event} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("calendar.past")}</h2>
          <div className="space-y-2 opacity-60">
            {past.map(event => <EventCard key={event.id} event={event} />)}
          </div>
        </div>
      )}

      {filteredEvents.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("calendar.none")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
