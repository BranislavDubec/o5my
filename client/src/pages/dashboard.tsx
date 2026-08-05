import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, Vote, ArrowRight, MapPin, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAttendanceBorderClass, type AttendanceStatus } from "@/lib/event-attendance";
import { useI18n } from "@/lib/i18n";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";

interface DashboardEvent {
  id: number;
  type: string;
  title: string;
  location?: string | null;
  startTime: string;
  attendanceStatus?: AttendanceStatus;
}

interface DashboardPayment {
  id: number;
  amount: number;
  dueDate: string;
  description: string;
  status: string;
}

interface DashboardPoll {
  id: number;
  title: string;
  closesAt?: string | null;
}

interface Stats {
  playerCount: number;
  eventCount: number;
  upcomingEvents: DashboardEvent[];
  unansweredEvents: DashboardEvent[];
  activePolls: number;
  unansweredPolls: DashboardPoll[];
  outstandingPayments: DashboardPayment[];
}

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });
  const { t, lang } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;

  const upcomingEvents = stats?.upcomingEvents || [];
  const unansweredEvents = stats?.unansweredEvents || [];
  const unansweredPolls = stats?.unansweredPolls || [];
  const outstandingPayments = stats?.outstandingPayments || [];
  const hasUnansweredVotes = unansweredEvents.length > 0 || unansweredPolls.length > 0;

  const formatEventDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEE d. MMMM", { locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  const formatEventTime = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  const formatDueDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "d. MMM yyyy", { locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  const typeLabel = (type: string) =>
    type === "match" ? t("eventTypes.match") : type === "teambuilding" ? t("eventTypes.teambuilding") : t("eventTypes.training");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {outstandingPayments.length > 0 && (
        <Card data-testid="dashboard-payments">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              {t("dashboard.payments")}
            </CardTitle>
            <Link href="/payments">
              <Button variant="ghost" size="sm" className="text-primary">
                {t("dashboard.all")} <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {outstandingPayments.map(payment => (
              <Link key={payment.id} href="/payments">
                <div
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 hover-elevate cursor-pointer ${
                    payment.status === "overdue"
                      ? "border-red-500/80 dark:border-red-400/80"
                      : "border-yellow-500/80 dark:border-yellow-400/80"
                  }`}
                  data-testid={`dashboard-payment-${payment.id}`}
                >
                  <CreditCard className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{payment.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("dashboard.amountDue", { amount: payment.amount, date: formatDueDate(payment.dueDate) })}
                    </p>
                  </div>
                  <Badge variant={payment.status === "overdue" ? "destructive" : "secondary"}>
                    {payment.status === "overdue" ? t("dashboard.overdue") : t("dashboard.pending")}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {hasUnansweredVotes && (
        <Card data-testid="dashboard-unanswered-votes">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Vote className="w-4 h-4 text-orange-500" />
              {t("dashboard.unansweredVotes")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {unansweredEvents.map(event => (
              <Link key={`event-${event.id}`} href={`/events/${event.id}`}>
                <div
                  className="flex items-center gap-3 rounded-lg border-2 border-orange-500/80 p-3 hover-elevate cursor-pointer dark:border-orange-400/80"
                  data-testid={`dashboard-unanswered-event-${event.id}`}
                >
                  <Calendar className="w-5 h-5 text-orange-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatEventDate(event.startTime)} · {formatEventTime(event.startTime)}
                    </p>
                  </div>
                  <Badge variant="outline">{t("dashboard.attendance")}</Badge>
                </div>
              </Link>
            ))}

            {unansweredPolls.map(poll => (
              <Link key={`poll-${poll.id}`} href={`/polls/${poll.id}`}>
                <div
                  className="flex items-center gap-3 rounded-lg border-2 border-orange-500/80 p-3 hover-elevate cursor-pointer dark:border-orange-400/80"
                  data-testid={`dashboard-unanswered-poll-${poll.id}`}
                >
                  <Vote className="w-5 h-5 text-orange-500 shrink-0" />
                  <p className="font-medium text-sm flex-1 min-w-0 truncate">{poll.title}</p>
                  <Badge variant="outline">{t("dashboard.poll")}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Link href="/members" className="block rounded-lg" data-testid="link-dashboard-players">
          <Card className="h-full hover-elevate cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Users className="w-5 h-5 text-primary mb-2" />
              <span className="text-xl font-bold" data-testid="stat-players">{stats?.playerCount ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.players")}</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/calendar" className="block rounded-lg" data-testid="link-dashboard-events">
          <Card className="h-full hover-elevate cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Calendar className="w-5 h-5 text-primary mb-2" />
              <span className="text-xl font-bold" data-testid="stat-events">{stats?.eventCount ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.events")}</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/polls" className="block rounded-lg" data-testid="link-dashboard-polls">
          <Card className="h-full hover-elevate cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Vote className="w-5 h-5 text-primary mb-2" />
              <span className="text-xl font-bold" data-testid="stat-polls">{stats?.activePolls ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.polls")}</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.upcoming")}</CardTitle>
          <Link href="/calendar">
            <Button variant="ghost" size="sm" className="text-primary">
              {t("dashboard.all")} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noUpcoming")}</p>
          ) : (
            upcomingEvents.map(event => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer ${getAttendanceBorderClass(event.attendanceStatus)}`}
                  data-attendance-status={event.attendanceStatus || "unanswered"}
                  data-testid={`card-event-${event.id}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${event.type === "match" ? "bg-primary/15" : event.type === "teambuilding" ? "bg-purple-500/15" : "bg-blue-500/15"}`}>
                    {event.type === "match" ? (
                      <span className="text-primary text-lg">⚽</span>
                    ) : event.type === "teambuilding" ? (
                      <span className="text-purple-500 text-lg">🎉</span>
                    ) : (
                      <span className="text-blue-500 text-lg">🏃</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      <Badge variant={event.type === "match" ? "default" : "secondary"} className="text-xs shrink-0">
                        {typeLabel(event.type)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatEventDate(event.startTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatEventTime(event.startTime)}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
