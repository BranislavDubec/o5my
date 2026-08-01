import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";

interface EventResponse {
  id: number;
  status: string;
  user: { id: number; name: string };
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "going": return "Idem";
    case "maybe": return "Možno";
    case "not_going": return "Neidem";
    default: return "Nehlasoval";
  }
}

function getStatusClass(status?: string) {
  switch (status) {
    case "going": return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "maybe": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
    case "not_going": return "bg-red-500/10 text-red-600 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export function EventAttendanceBadge({ eventId }: { eventId: number }) {
  const { user } = useAuth();

  const { data: responses = [] } = useQuery<EventResponse[]>({
    queryKey: ["/api/events", String(eventId), "responses"],
    enabled: Boolean(user?.id),
  });

  if (!user?.id) return null;

  const myResponse = responses.find(response => response.user.id === user.id);
  const statusLabel = getStatusLabel(myResponse?.status);

  return (
    <Badge variant="secondary" className={getStatusClass(myResponse?.status)}>
      Ty: {statusLabel}
    </Badge>
  );
}
