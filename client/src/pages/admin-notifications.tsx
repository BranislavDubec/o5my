import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";
import { BellRing, CalendarClock, CreditCard, Send, Users, Vote } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";

interface UserItem {
  id: number;
  name: string;
  isActive: boolean;
  emailVerified: boolean;
  role: string;
}

interface EventItem {
  id: number;
  title: string;
  startTime: string;
}

interface PollItem {
  id: number;
  title: string;
  closesAt: string | null;
}

interface PaymentItem {
  id: number;
  identity: string | null;
  userId: number;
  status: string;
}

type NotificationContext = "general" | "event" | "poll" | "payment";
type NotificationTarget = "all" | "user" | "event_unanswered" | "poll_unanswered" | "payment_identity" | "unpaid";

export default function AdminNotifications() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [context, setContext] = useState<NotificationContext>("general");
  const [target, setTarget] = useState<NotificationTarget>("all");
  const [userId, setUserId] = useState("");
  const [eventId, setEventId] = useState("");
  const [pollId, setPollId] = useState("");
  const [paymentIdentity, setPaymentIdentity] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: users = [] } = useQuery<UserItem[]>({ queryKey: ["/api/users"] });
  const { data: events = [] } = useQuery<EventItem[]>({ queryKey: ["/api/events"] });
  const { data: polls = [] } = useQuery<PollItem[]>({ queryKey: ["/api/polls"] });
  const { data: payments = [] } = useQuery<PaymentItem[]>({
    queryKey: ["/api/payments/all"],
    enabled: isAdmin,
  });
  const activeUsers = users.filter(user => (
    user.isActive
    && user.emailVerified
    && (context !== "payment" || user.role !== "manager")
  ));
  const sortedEvents = [...events].sort((first, second) => first.startTime.localeCompare(second.startTime));
  const paymentIdentities = Array.from(new Set(payments.map(payment => payment.identity?.trim()).filter((value): value is string => !!value)))
    .sort((first, second) => first.localeCompare(second, lang === "cz" ? "cs" : lang));
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/notifications", {
        context,
        target,
        userId: target === "user" ? Number(userId) : undefined,
        eventId: context === "event" ? Number(eventId) : undefined,
        pollId: context === "poll" ? Number(pollId) : undefined,
        paymentIdentity: context === "payment" ? paymentIdentity || undefined : undefined,
        title,
        body,
      });
      return response.json() as Promise<{ recipientCount: number }>;
    },
    onSuccess: result => {
      toast({ title: t("adminNotifications.sent"), description: t("adminNotifications.recipients", { count: result.recipientCount }) });
      setTitle("");
      setBody("");
    },
    onError: (error: Error) => toast({ title: t("adminNotifications.sendFailed"), description: error.message, variant: "destructive" }),
  });

  const changeContext = (value: NotificationContext) => {
    setContext(value);
    setUserId("");
    setPaymentIdentity("");
    if (value === "event") {
      setTarget("event_unanswered");
      setPollId("");
      setTitle(t("adminNotifications.eventReminderTitle"));
      setBody(t("adminNotifications.eventReminderBody"));
    } else if (value === "poll") {
      setTarget("poll_unanswered");
      setEventId("");
      setTitle(t("adminNotifications.pollReminderTitle"));
      setBody(t("adminNotifications.pollReminderBody"));
    } else if (value === "payment") {
      setTarget("unpaid");
      setEventId("");
      setPollId("");
      setTitle(t("adminNotifications.paymentReminderTitle"));
      setBody(t("adminNotifications.paymentReminderBody"));
    } else {
      setTarget("all");
      setEventId("");
      setPollId("");
      setTitle("");
      setBody("");
    }
  };

  const canSend = title.trim()
    && body.trim()
    && (context !== "event" || eventId)
    && (context !== "poll" || pollId)
    && (context !== "payment" || target !== "payment_identity" || paymentIdentity.trim().length > 0)
    && (target !== "user" || userId);

  const submit = () => {
    const broadTarget = target !== "user";
    if (broadTarget && !confirm(t("adminNotifications.sendConfirm"))) return;
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("adminNotifications.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("adminNotifications.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BellRing className="w-4 h-4" />{t("adminNotifications.newNotification")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>{t("adminNotifications.context")}</Label>
            <Select value={context} onValueChange={value => changeContext(value as NotificationContext)}>
              <SelectTrigger data-testid="select-notification-context"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general"><span className="flex items-center"><BellRing className="w-4 h-4 mr-2" />{t("adminNotifications.contextGeneral")}</span></SelectItem>
                <SelectItem value="event"><span className="flex items-center"><CalendarClock className="w-4 h-4 mr-2" />{t("adminNotifications.contextEvent")}</span></SelectItem>
                <SelectItem value="poll"><span className="flex items-center"><Vote className="w-4 h-4 mr-2" />{t("adminNotifications.contextPoll")}</span></SelectItem>
                {isAdmin && <SelectItem value="payment"><span className="flex items-center"><CreditCard className="w-4 h-4 mr-2" />{t("adminNotifications.contextPayment")}</span></SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {context === "event" && (
            <div className="space-y-2">
              <Label>{t("adminNotifications.contextEvent")}</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger data-testid="select-notification-event"><SelectValue placeholder={t("adminNotifications.selectEvent")} /></SelectTrigger>
                <SelectContent>
                  {sortedEvents.map(event => (
                    <SelectItem key={event.id} value={String(event.id)}>
                      {event.title} · {format(parseISO(event.startTime), "d. MMM yyyy HH:mm", { locale: dateLocale })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {context === "poll" && (
            <div className="space-y-2">
              <Label>{t("adminNotifications.contextPoll")}</Label>
              <Select value={pollId} onValueChange={setPollId}>
                <SelectTrigger data-testid="select-notification-poll"><SelectValue placeholder={t("adminNotifications.selectPoll")} /></SelectTrigger>
                <SelectContent>
                  {polls.map(poll => (
                    <SelectItem key={poll.id} value={String(poll.id)}>{poll.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("adminNotifications.recipientsLabel")}</Label>
            <Select value={target} onValueChange={value => setTarget(value as NotificationTarget)}>
              <SelectTrigger data-testid="select-notification-target"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminNotifications.targetAll", { count: activeUsers.length })}</SelectItem>
                <SelectItem value="user">{t("adminNotifications.targetUser")}</SelectItem>
                {context === "event" && <SelectItem value="event_unanswered">{t("adminNotifications.targetEventUnanswered")}</SelectItem>}
                {context === "poll" && <SelectItem value="poll_unanswered">{t("adminNotifications.targetPollUnanswered")}</SelectItem>}
                {context === "payment" && (
                  <>
                    <SelectItem value="payment_identity">{t("adminNotifications.targetPaymentIdentity")}</SelectItem>
                    <SelectItem value="unpaid">{t("adminNotifications.targetUnpaid")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {context === "payment" && target !== "user" && (
            <div className="space-y-2">
              <Label>{t("adminNotifications.paymentIdentityLabel")}</Label>
              <Select value={paymentIdentity || "__all__"} onValueChange={value => setPaymentIdentity(value === "__all__" ? "" : value)}>
                <SelectTrigger data-testid="select-notification-payment-identity"><SelectValue placeholder={t("adminNotifications.selectPaymentIdentity")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("adminNotifications.allPaymentIdentities")}</SelectItem>
                  {paymentIdentities.map(identity => (
                    <SelectItem key={identity} value={identity}>{identity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {target === "unpaid"
                  ? t("adminNotifications.paymentIdentityOptional")
                  : t("adminNotifications.paymentIdentityRequired")}
              </p>
            </div>
          )}

          {target === "user" && (
            <div className="space-y-2">
              <Label>{t("adminNotifications.memberLabel")}</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger data-testid="select-notification-user"><SelectValue placeholder={t("adminNotifications.selectMember")} /></SelectTrigger>
                <SelectContent>
                  {activeUsers.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notification-title">{t("adminNotifications.titleLabel")}</Label>
            <Input id="notification-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder={t("adminNotifications.titlePlaceholder")} data-testid="input-notification-title" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-body">{t("adminNotifications.bodyLabel")}</Label>
            <Textarea id="notification-body" value={body} onChange={event => setBody(event.target.value)} maxLength={800} rows={4} placeholder={t("adminNotifications.bodyPlaceholder")} data-testid="input-notification-body" />
            <p className="text-xs text-muted-foreground text-right">{body.length}/800</p>
          </div>

          <Button onClick={submit} disabled={!canSend || sendMutation.isPending} data-testid="button-send-notification">
            <Send className="w-4 h-4 mr-1.5" />{sendMutation.isPending ? t("adminNotifications.sending") : t("adminNotifications.send")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {t("adminNotifications.infoHint")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
