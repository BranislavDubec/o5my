import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface PollDetail {
  id: number;
  title: string;
  description: string | null;
  closesAt: string | null;
  isAnonymous: boolean;
  options: { id: number; label: string; pollId: number }[];
  votes: { id: number; optionId: number; userId: number; user: { id: number; name: string } }[];
  results: { optionId: number; count: number }[];
  totalVotes: number;
  userVote: { id: number; optionId: number } | null | undefined;
}

export default function PollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: poll } = useQuery<PollDetail>({
    queryKey: ["/api/polls", id],
  });

  const voteMutation = useMutation({
    mutationFn: (optionId: number) =>
      apiRequest("POST", `/api/polls/${id}/votes`, { optionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("pollDetail.voteRecorded") });
    },
  });

  if (!poll) {
    return <div className="flex items-center justify-center p-8"><p className="text-muted-foreground">{t("common.loading")}</p></div>;
  }

  const isClosed = !!poll.closesAt && new Date(poll.closesAt) < new Date();
  const totalVotes = poll.totalVotes;
  const votesByOption = poll.options.map(opt => ({
    ...opt,
    count: poll.results.find(result => result.optionId === opt.id)?.count ?? 0,
    voters: poll.isAnonymous ? [] : poll.votes.filter(v => v.optionId === opt.id).map(v => v.user.name),
  }));

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/polls">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />{t("common.back")}
        </Button>
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2">
          {isClosed ? <Badge variant="secondary">{t("polls.closed")}</Badge> : <Badge variant="default">{t("polls.active")}</Badge>}
          {poll.isAnonymous && <Badge variant="outline"><EyeOff className="mr-1 h-3 w-3" />{t("polls.anonymousBadge")}</Badge>}
          <span className="text-xs text-muted-foreground">{totalVotes} {totalVotes === 1 ? t("pollDetail.voteOne") : t("pollDetail.voteMany")}</span>
        </div>
        <h1 className="font-serif text-xl font-bold" data-testid="text-poll-title">{poll.title}</h1>
        {poll.description && <p className="text-sm text-muted-foreground mt-2">{poll.description}</p>}
        {poll.isAnonymous && <p className="mt-2 text-xs text-muted-foreground">{t("pollDetail.anonymousHint")}</p>}
      </div>

      <div className="space-y-3">
        {votesByOption.map(opt => {
          const pct = !poll.isAnonymous && totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0;
          const isMyVote = poll.userVote?.optionId === opt.id;
          return (
            <Card
              key={opt.id}
              className={cn("overflow-hidden", isMyVote && "border-primary")}
              data-testid={`card-option-${opt.id}`}
            >
              <CardContent className="p-0">
                <button
                  onClick={() => !isClosed && voteMutation.mutate(opt.id)}
                  disabled={isClosed}
                  className={cn(
                    "w-full text-left p-4 transition-colors",
                    !isClosed && "hover-elevate cursor-pointer",
                    isClosed && "cursor-default"
                  )}
                  data-testid={`button-vote-${opt.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isMyVote && <Check className="w-4 h-4 text-primary" data-testid="icon-my-vote" />}
                      <span className="font-medium text-sm">{opt.label}</span>
                    </div>
                    {!poll.isAnonymous && (
                      <span className="text-sm font-semibold" data-testid={`text-votes-${opt.id}`}>{opt.count} ({pct}%)</span>
                    )}
                  </div>
                  {!poll.isAnonymous && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isMyVote ? "bg-primary" : "bg-muted-foreground/30")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {opt.voters.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {opt.voters.map(name => (
                        <span key={name} className="text-xs text-muted-foreground">{name}</span>
                      ))}
                    </div>
                  )}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isClosed && !poll.userVote && (
        <p className="text-sm text-muted-foreground text-center">{t("pollDetail.voteHint")}</p>
      )}
      {poll.userVote && !isClosed && (
        <p className="text-sm text-muted-foreground text-center">{t("pollDetail.votedHint")}</p>
      )}
    </div>
  );
}
