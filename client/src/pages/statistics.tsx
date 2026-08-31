import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Activity, Handshake, Home, Minus, Plane, Plus, Scale, Target, TrendingDown, Trophy, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { canManageTeam } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlayerStatistic {
  userId: number;
  name: string;
  goals: number;
  assists: number;
  appearances: number;
  updatedAt: string | null;
}

interface StatisticChange {
  userId: number;
  goalsDelta?: number;
  assistsDelta?: number;
}

type MatchOutcome = "W" | "D" | "L";

interface TeamVenueStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface TeamRecentResult {
  eventId: number;
  startTime: string;
  opponent: string | null;
  homeAway: string | null;
  teamScore: number;
  opponentScore: number;
  outcome: MatchOutcome;
}

interface TeamStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number | null;
  goalsPerMatch: number | null;
  goalsAgainstPerMatch: number | null;
  form: MatchOutcome[];
  home: TeamVenueStats;
  away: TeamVenueStats;
  biggestWin: TeamRecentResult | null;
  biggestLoss: TeamRecentResult | null;
  recentResults: TeamRecentResult[];
}

export default function StatisticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const isAdmin = canManageTeam(user?.role);
  const { data: statistics = [], isLoading } = useQuery<PlayerStatistic[]>({
    queryKey: ["/api/statistics"],
  });
  const { data: teamStats } = useQuery<TeamStats>({
    queryKey: ["/api/stats/team"],
  });

  const adjustMutation = useMutation({
    mutationFn: ({ userId, goalsDelta = 0, assistsDelta = 0 }: StatisticChange) =>
      apiRequest("PATCH", `/api/statistics/${userId}`, { goalsDelta, assistsDelta }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/statistics"] }),
    onError: (error: Error) => toast({ title: t("statistics.adjustFailed"), description: error.message, variant: "destructive" }),
  });

  const totalGoals = statistics.reduce((sum, statistic) => sum + statistic.goals, 0);
  const totalAssists = statistics.reduce((sum, statistic) => sum + statistic.assists, 0);
  const leader = statistics.find(statistic => statistic.goals > 0 || statistic.assists > 0);

  const outcomeClass = (outcome: MatchOutcome) =>
    outcome === "W"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : outcome === "L"
        ? "bg-red-500/15 text-red-700 dark:text-red-400"
        : "bg-muted text-muted-foreground";

  const outcomeBorderClass = (outcome: MatchOutcome) =>
    outcome === "W" ? "border-green-500/60" : outcome === "L" ? "border-red-500/60" : "border-muted";

  const outcomeShort = (outcome: MatchOutcome) =>
    outcome === "W" ? t("opponents.winShort") : outcome === "L" ? t("opponents.lossShort") : t("opponents.drawShort");

  const formatResultDate = (startTime: string) => {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) return startTime;
    return date.toLocaleDateString(lang === "sk" ? "sk-SK" : lang === "cz" ? "cs-CZ" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const TeamTile = ({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) => (
    <Card>
      <CardContent className="p-4 flex flex-col items-center text-center">
        {icon}
        <span className="text-xl font-bold">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );

  const VenueCard = ({ title, venue, icon }: { title: string; venue: TeamVenueStats; icon: React.ReactNode }) => (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">{icon}{title}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold tabular-nums">{venue.played}</p>
          <p className="text-[10px] text-muted-foreground">{t("statistics.played")}</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{venue.wins}</p>
          <p className="text-[10px] text-muted-foreground">{t("statistics.wins")}</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{venue.losses}</p>
          <p className="text-[10px] text-muted-foreground">{t("statistics.losses")}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {t("statistics.score")}: <span className="font-semibold text-foreground">{venue.goalsFor}:{venue.goalsAgainst}</span>
      </p>
    </div>
  );

  const ExtremeCard = ({ title, result, tone }: { title: string; result: TeamRecentResult | null; tone: "win" | "loss" }) => (
    <div className={`rounded-lg border-2 p-3 ${tone === "win" ? "border-green-500/60" : "border-red-500/60"}`}>
      <p className={`text-xs font-medium mb-2 ${tone === "win" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{title}</p>
      {result ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{result.opponent || t("matches.defaultOpponent")}</p>
            <p className="text-xs text-muted-foreground">{formatResultDate(result.startTime)}</p>
          </div>
          <span className="text-xl font-bold tabular-nums shrink-0">{result.teamScore}:{result.opponentScore}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );

  const counter = (
    statistic: PlayerStatistic,
    type: "goals" | "assists" | "appearances",
    icon: React.ReactNode,
    label: string,
  ) => {
    const value = statistic[type];
    const isAdjustable = type === "goals" || type === "assists";
    const deltaKey = type === "goals" ? "goalsDelta" : "assistsDelta";
    return (
      <div className="flex flex-col items-center gap-1" data-testid={`${type}-${statistic.userId}`}>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</span>
        <div className="flex items-center gap-1">
          {isAdjustable && isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={value === 0 || adjustMutation.isPending}
              onClick={() => adjustMutation.mutate({ userId: statistic.userId, [deltaKey]: -1 })}
              aria-label={t(type === "goals" ? "statistics.removeGoal" : "statistics.removeAssist", { name: statistic.name })}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
          )}
          <span className="w-9 text-center text-xl font-bold tabular-nums">{value}</span>
          {isAdjustable && isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={adjustMutation.isPending}
              onClick={() => adjustMutation.mutate({ userId: statistic.userId, [deltaKey]: 1 })}
              aria-label={t(type === "goals" ? "statistics.addGoal" : "statistics.addAssist", { name: statistic.name })}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("statistics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("statistics.subtitle")}</p>
      </div>

      {teamStats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              {t("statistics.teamTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TeamTile icon={<Activity className="w-5 h-5 text-primary mb-2" />} value={teamStats.totalMatches} label={t("statistics.played")} />
              <TeamTile icon={<Trophy className="w-5 h-5 text-green-600 dark:text-green-400 mb-2" />} value={teamStats.wins} label={t("statistics.wins")} />
              <TeamTile icon={<Scale className="w-5 h-5 text-muted-foreground mb-2" />} value={teamStats.draws} label={t("statistics.draws")} />
              <TeamTile icon={<TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400 mb-2" />} value={teamStats.losses} label={t("statistics.losses")} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span>
                  <span className="text-muted-foreground">{t("statistics.score")}: </span>
                  <span className="font-bold tabular-nums">{teamStats.goalsFor}:{teamStats.goalsAgainst}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">{t("statistics.goalDifference")}: </span>
                  <span className="font-bold tabular-nums">{teamStats.goalDifference > 0 ? `+${teamStats.goalDifference}` : teamStats.goalDifference}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">{t("statistics.winRate")}: </span>
                  <span className="font-bold tabular-nums">{teamStats.winRate !== null ? `${teamStats.winRate} %` : "—"}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">{t("statistics.goalsPerMatch")}: </span>
                  <span className="font-bold tabular-nums">{teamStats.goalsPerMatch !== null ? teamStats.goalsPerMatch : "—"}</span>
                </span>
              </div>
              {teamStats.form.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">{t("statistics.form")}:</span>
                  {teamStats.form.map((outcome, index) => (
                    <span key={`${outcome}-${index}`} className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${outcomeClass(outcome)}`}>
                      {outcomeShort(outcome)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <VenueCard title={t("statistics.home")} venue={teamStats.home} icon={<Home className="w-4 h-4 text-primary" />} />
              <VenueCard title={t("statistics.away")} venue={teamStats.away} icon={<Plane className="w-4 h-4 text-primary" />} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ExtremeCard title={t("statistics.biggestWin")} result={teamStats.biggestWin} tone="win" />
              <ExtremeCard title={t("statistics.biggestLoss")} result={teamStats.biggestLoss} tone="loss" />
            </div>
          </CardContent>
        </Card>
      )}

      {teamStats && teamStats.recentResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {t("statistics.recentResults")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {teamStats.recentResults.map(result => (
              <Link key={result.eventId} href={`/events/${result.eventId}`}>
                <div
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 hover-elevate cursor-pointer ${outcomeBorderClass(result.outcome)}`}
                  data-testid={`team-result-${result.eventId}`}
                >
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{formatResultDate(result.startTime)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {result.opponent || t("matches.defaultOpponent")}
                      {result.homeAway === "home" ? ` (${t("statistics.home")})` : result.homeAway === "away" ? ` (${t("statistics.away")})` : ""}
                    </p>
                  </div>
                  <span className="text-lg font-bold tabular-nums shrink-0">{result.teamScore}:{result.opponentScore}</span>
                  <Badge className={`shrink-0 border-0 ${outcomeClass(result.outcome)}`}>
                    {result.outcome === "W" ? t("matches.win") : result.outcome === "L" ? t("matches.loss") : t("matches.draw")}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <h2 className="font-serif text-lg font-bold pt-2">{t("statistics.playersTitle")}</h2>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("statistics.loading")}</CardContent></Card>
      ) : statistics.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("statistics.noPlayers")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {statistics.map((statistic, index) => (
            <Card key={statistic.userId} data-testid={`player-statistic-${statistic.userId}`}>
              <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${index === 0 && leader ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                    {index + 1}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                    {statistic.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{statistic.name}</p>
                    {index === 0 && leader && <Badge variant="secondary" className="mt-1 text-[10px]"><Trophy className="w-3 h-3 mr-1" />{t("statistics.leader")}</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 sm:gap-8 shrink-0">
                  {counter(statistic, "goals", <Target className="w-3.5 h-3.5" />, t("statistics.goals"))}
                  {counter(statistic, "assists", <Handshake className="w-3.5 h-3.5" />, t("statistics.assists"))}
                  {counter(statistic, "appearances", <Users className="w-3.5 h-3.5" />, t("statistics.appearances"))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
