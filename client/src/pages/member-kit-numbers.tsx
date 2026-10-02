import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface Member {
  id: number;
  name: string;
  kitNumber: number | null;
}

export default function MemberKitNumbers() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/users"],
  });

  const updateKitNumberMutation = useMutation({
    mutationFn: ({ id, kitNumber }: { id: number; kitNumber: number | null }) =>
      apiRequest("PUT", `/api/users/${id}/kit-number`, { kitNumber }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDrafts(previous => {
        const next = { ...previous };
        delete next[variables.id];
        return next;
      });
      toast({ title: t("adminMembers.kitNumberSaved") });
    },
    onError: (error: Error) => {
      toast({
        title: t("adminMembers.kitNumberSaveFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sharedMembers = members.filter(member => member.kitNumber === null);
  const assignedMembers = members
    .filter((member): member is Member & { kitNumber: number } => member.kitNumber !== null)
    .sort((first, second) => first.kitNumber - second.kitNumber || first.name.localeCompare(second.name));

  const renderMember = (member: Member) => {
    const currentValue = member.kitNumber === null ? "" : String(member.kitNumber);
    const value = drafts[member.id] ?? currentValue;
    const parsedNumber = value === "" ? null : Number(value);
    const isValid = value === "" || (Number.isSafeInteger(parsedNumber) && parsedNumber! >= 0);
    const hasChanged = value !== currentValue;

    return (
      <form
        key={member.id}
        className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-3 border-b py-2 last:border-b-0"
        onSubmit={event => {
          event.preventDefault();
          if (isValid && hasChanged) {
            updateKitNumberMutation.mutate({ id: member.id, kitNumber: parsedNumber });
          }
        }}
      >
        <span className="min-w-0 break-words text-sm font-medium">{member.name}</span>
        <Input
          type="number"
          min="0"
          step="1"
          value={value}
          aria-label={`${t("adminMembers.kitNumber")} - ${member.name}`}
          onChange={event => setDrafts(previous => ({ ...previous, [member.id]: event.target.value }))}
          data-testid={`input-kit-number-${member.id}`}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!isValid || !hasChanged || updateKitNumberMutation.isPending}
          data-testid={`button-save-kit-number-${member.id}`}
        >
          {t("common.save")}
        </Button>
      </form>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("adminMembers.backToMembers")}>
          <Link href="/members"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="font-serif text-xl font-bold">{t("adminMembers.kitNumbersTitle")}</h1>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("adminMembers.sharedKitNumbers")}</h2>
            <div className="divide-y rounded-md border px-3">
              {sharedMembers.length ? sharedMembers.map(renderMember) : (
                <p className="py-3 text-sm text-muted-foreground">{t("adminMembers.noSharedKitNumbers")}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("adminMembers.assignedKitNumbers")}</h2>
            <div className="divide-y rounded-md border px-3">
              {assignedMembers.length ? assignedMembers.map(renderMember) : (
                <p className="py-3 text-sm text-muted-foreground">{t("adminMembers.noAssignedKitNumbers")}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}