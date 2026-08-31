import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { canManageTeam } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EyeOff, Plus, Trash2, Users, Vote } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";

interface Poll {
  id: number;
  title: string;
  description: string | null;
  closesAt: string | null;
  createdAt: string;
  isAnonymous: boolean;
}

interface PollMember {
  id: number;
  name: string;
  isActive: boolean;
  emailVerified: boolean;
}

const createEmptyForm = () => ({
  title: "",
  description: "",
  options: ["", ""],
  optionMode: "custom" as "custom" | "members",
  memberIds: [] as number[],
  isAnonymous: false,
});

export default function PollsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { lang, t } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(createEmptyForm);

  const { data: polls = [] } = useQuery<Poll[]>({
    queryKey: ["/api/polls"],
  });
  const { data: users = [] } = useQuery<PollMember[]>({
    queryKey: ["/api/users"],
    enabled: canManageTeam(user?.role),
  });
  const members = users
    .filter(member => member.isActive && member.emailVerified)
    .sort((first, second) => first.name.localeCompare(second.name, lang === "cz" ? "cs" : lang));

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/polls", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("polls.created") });
      setDialogOpen(false);
      setForm(createEmptyForm());
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/polls/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t("polls.deleted") });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const options = form.options.map(option => option.trim()).filter(Boolean);
    if (form.optionMode === "custom") {
      if (options.length < 2) {
        toast({ title: t("polls.needTwoOptions"), variant: "destructive" });
        return;
      }
    } else if (form.memberIds.length < 2) {
      toast({ title: t("polls.needTwoMembers"), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      optionMode: form.optionMode,
      options: form.optionMode === "custom" ? options : undefined,
      memberIds: form.optionMode === "members" ? form.memberIds : undefined,
      isAnonymous: form.isAnonymous,
    });
  };

  const toggleMember = (memberId: number, selected: boolean) => {
    setForm(previous => ({
      ...previous,
      memberIds: selected
        ? Array.from(new Set([...previous.memberIds, memberId]))
        : previous.memberIds.filter(id => id !== memberId),
    }));
  };

  const isClosed = (closesAt: string | null) => closesAt && new Date(closesAt) < new Date();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">{t("polls.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("polls.subtitle")}</p>
        </div>
        {canManageTeam(user?.role) && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-poll"><Plus className="w-4 h-4 mr-1" />{t("polls.newPoll")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("polls.newPoll")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{t("polls.question")}</Label>
                  <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder={t("polls.questionPlaceholder")} data-testid="input-poll-title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t("polls.description", { optional: t("common.optional") })}</Label>
                  <Textarea id="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} data-testid="input-poll-description" />
                </div>
                <div className="space-y-2">
                  <Label>{t("polls.options")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={form.optionMode === "custom" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm(previous => ({ ...previous, optionMode: "custom" }))}
                    >
                      {t("polls.customOptions")}
                    </Button>
                    <Button
                      type="button"
                      variant={form.optionMode === "members" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm(previous => ({ ...previous, optionMode: "members" }))}
                    >
                      <Users className="mr-1 h-3.5 w-3.5" />{t("polls.memberOptions")}
                    </Button>
                  </div>
                  {form.optionMode === "custom" ? (
                    <>
                      {form.options.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            value={opt}
                            onChange={e => {
                              const opts = [...form.options];
                              opts[i] = e.target.value;
                              setForm({ ...form, options: opts });
                            }}
                            placeholder={t("polls.optionPlaceholder", { number: i + 1 })}
                            data-testid={`input-option-${i}`}
                          />
                          {form.options.length > 2 && (
                            <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })}>
                              ×
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                        <Plus className="mr-1 h-3 w-3" />{t("polls.addOption")}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-2 rounded-md border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <span className="text-xs text-muted-foreground">
                          {t("polls.membersSelected", { count: form.memberIds.length })}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={members.length === 0}
                            onClick={() => setForm(previous => ({ ...previous, memberIds: members.map(member => member.id) }))}
                          >
                            {t("polls.selectAllMembers")}
                          </Button>
                          {form.memberIds.length > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setForm(previous => ({ ...previous, memberIds: [] }))}
                            >
                              {t("polls.clearSelection")}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-44 space-y-1 overflow-y-auto">
                        {members.length === 0 ? (
                          <p className="p-2 text-sm text-muted-foreground">{t("polls.noMembers")}</p>
                        ) : members.map(member => {
                          const checkboxId = `poll-member-${member.id}`;
                          return (
                            <div key={member.id} className="flex items-center gap-3 rounded-md px-2 hover:bg-muted">
                              <Checkbox
                                id={checkboxId}
                                checked={form.memberIds.includes(member.id)}
                                onCheckedChange={checked => toggleMember(member.id, checked === true)}
                              />
                              <Label htmlFor={checkboxId} className="flex-1 cursor-pointer py-2 font-normal">
                                {member.name}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id="poll-anonymous"
                    checked={form.isAnonymous}
                    onCheckedChange={checked => setForm(previous => ({ ...previous, isAnonymous: checked === true }))}
                    data-testid="checkbox-poll-anonymous"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="poll-anonymous" className="flex cursor-pointer items-center gap-1.5">
                      <EyeOff className="h-4 w-4" />{t("polls.anonymousPoll")}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t("polls.anonymousDescription")}</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-poll">
                    {createMutation.isPending ? t("calendar.creating") : t("calendar.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {polls.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Vote className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("polls.none")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {polls.map(poll => (
            <Link key={poll.id} href={`/polls/${poll.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-poll-${poll.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{poll.title}</p>
                      {poll.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{poll.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(parseISO(poll.createdAt), "d. MMM yyyy", { locale: dateLocale })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isClosed(poll.closesAt) ? (
                        <Badge variant="secondary">{t("polls.closed")}</Badge>
                      ) : (
                        <Badge variant="default">{t("polls.active")}</Badge>
                      )}
                      {poll.isAnonymous && (
                        <Badge variant="outline"><EyeOff className="mr-1 h-3 w-3" />{t("polls.anonymousBadge")}</Badge>
                      )}
                      {canManageTeam(user?.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm(t("polls.deleteConfirm"))) deleteMutation.mutate(poll.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
