import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Minus, Plus, Target, Trophy, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PlayerStatistic {
  userId: number;
  name: string;
  goals: number;
  assists: number;
  updatedAt: string | null;
}

interface StatisticChange {
  userId: number;
  goalsDelta?: number;
  assistsDelta?: number;
}

export default function StatisticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const { data: statistics = [], isLoading } = useQuery<PlayerStatistic[]>({
    queryKey: ["/api/statistics"],
  });

  const adjustMutation = useMutation({
    mutationFn: ({ userId, goalsDelta = 0, assistsDelta = 0 }: StatisticChange) =>
      apiRequest("PATCH", `/api/statistics/${userId}`, { goalsDelta, assistsDelta }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/statistics"] }),
    onError: (error: Error) => toast({ title: "Štatistiku sa nepodarilo upraviť", description: error.message, variant: "destructive" }),
  });

  const totalGoals = statistics.reduce((sum, statistic) => sum + statistic.goals, 0);
  const totalAssists = statistics.reduce((sum, statistic) => sum + statistic.assists, 0);
  const leader = statistics.find(statistic => statistic.goals > 0 || statistic.assists > 0);

  const counter = (
    statistic: PlayerStatistic,
    type: "goals" | "assists",
    icon: React.ReactNode,
    label: string,
  ) => {
    const value = statistic[type];
    const deltaKey = type === "goals" ? "goalsDelta" : "assistsDelta";
    return (
      <div className="flex flex-col items-center gap-1" data-testid={`${type}-${statistic.userId}`}>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</span>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={value === 0 || adjustMutation.isPending}
              onClick={() => adjustMutation.mutate({ userId: statistic.userId, [deltaKey]: -1 })}
              aria-label={`Odobrať ${type === "goals" ? "gól" : "asistenciu"} hráčovi ${statistic.name}`}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
          )}
          <span className="w-9 text-center text-xl font-bold tabular-nums">{value}</span>
          {isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={adjustMutation.isPending}
              onClick={() => adjustMutation.mutate({ userId: statistic.userId, [deltaKey]: 1 })}
              aria-label={`Pridať ${type === "goals" ? "gól" : "asistenciu"} hráčovi ${statistic.name}`}
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
        <h1 className="font-serif text-xl font-bold">Štatistiky</h1>
        <p className="text-sm text-muted-foreground mt-1">Góly a asistencie hráčov O5MY</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Target className="w-5 h-5 text-primary mb-2" />
            <span className="text-xl font-bold">{totalGoals}</span>
            <span className="text-xs text-muted-foreground">Góly</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Handshake className="w-5 h-5 text-primary mb-2" />
            <span className="text-xl font-bold">{totalAssists}</span>
            <span className="text-xs text-muted-foreground">Asistencie</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center min-w-0">
            <Trophy className="w-5 h-5 text-amber-500 mb-2" />
            <span className="text-sm font-bold truncate max-w-full">{leader?.name || "—"}</span>
            <span className="text-xs text-muted-foreground">Líder</span>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Načítavam štatistiky…</CardContent></Card>
      ) : statistics.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nie sú dostupní žiadni aktívni hráči</p>
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
                    {index === 0 && leader && <Badge variant="secondary" className="mt-1 text-[10px]"><Trophy className="w-3 h-3 mr-1" />Líder</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:gap-8 shrink-0">
                  {counter(statistic, "goals", <Target className="w-3.5 h-3.5" />, "Góly")}
                  {counter(statistic, "assists", <Handshake className="w-3.5 h-3.5" />, "Asistencie")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
