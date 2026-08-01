import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, Vote, ArrowRight, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";

interface Stats {
  playerCount: number;
  upcomingEvents: any[];
  activePolls: number;
}

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const upcomingEvents = stats?.upcomingEvents || [];

  const formatEventDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEE d. MMMM", { locale: sk });
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Prehľad tímu a nadchádzajúcich akcií</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Users className="w-5 h-5 text-primary mb-2" />
            <span className="text-xl font-bold" data-testid="stat-players">{stats?.playerCount ?? "—"}</span>
            <span className="text-xs text-muted-foreground">Hráči</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Calendar className="w-5 h-5 text-primary mb-2" />
            <span className="text-xl font-bold" data-testid="stat-events">{upcomingEvents.length}</span>
            <span className="text-xs text-muted-foreground">Nadchádzajúce</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Vote className="w-5 h-5 text-primary mb-2" />
            <span className="text-xl font-bold" data-testid="stat-polls">{stats?.activePolls ?? "—"}</span>
            <span className="text-xs text-muted-foreground">Ankety</span>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Nadchádzajúce akcie</CardTitle>
          <Link href="/calendar">
            <Button variant="ghost" size="sm" className="text-primary">
              Všetko <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Žiadne nadchádzajúce akcie</p>
          ) : (
            upcomingEvents.map(event => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer" data-testid={`card-event-${event.id}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${event.type === "match" ? "bg-primary/15" : "bg-blue-500/15"}`}>
                    {event.type === "match" ? (
                      <span className="text-primary text-lg">⚽</span>
                    ) : (
                      <span className="text-blue-500 text-lg">🏃</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      <Badge variant={event.type === "match" ? "default" : "secondary"} className="text-xs shrink-0">
                        {event.type === "match" ? "Zápas" : "Tréning"}
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

