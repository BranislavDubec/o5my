import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface Member {
  id: number;
  name: string;
  kitNumber: number | null;
  isActive: boolean;
  isPlayerActive: boolean;
}

export default function MemberKitNumbers() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sharedNumberDraft, setSharedNumberDraft] = useState("");

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ["/api/users"],
  });
  const { data: sharedKitNumbers = [], isLoading: sharedNumbersLoading } = useQuery<number[]>({
    queryKey: ["/api/shared-kit-numbers"],
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

  const addSharedKitNumberMutation = useMutation({
    mutationFn: (kitNumber: number) => apiRequest("POST", "/api/shared-kit-numbers", { kitNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shared-kit-numbers"] });
      setSharedNumberDraft("");
      toast({ title: t("adminMembers.sharedKitNumberAdded") });
    },
    onError: (error: Error) => {
      toast({ title: t("adminMembers.sharedKitNumberAddFailed"), description: error.message, variant: "destructive" });
    },
  });

  const removeSharedKitNumberMutation = useMutation({
    mutationFn: (kitNumber: number) => apiRequest("DELETE", `/api/shared-kit-numbers/${kitNumber}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shared-kit-numbers"] });
      toast({ title: t("adminMembers.sharedKitNumberRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("adminMembers.sharedKitNumberRemoveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const activeMembers = members.filter(member => member.isActive && member.isPlayerActive);
  const parsedSharedNumber = sharedNumberDraft === "" ? null : Number(sharedNumberDraft);
  const isSharedNumberValid = parsedSharedNumber !== null
    && Number.isSafeInteger(parsedSharedNumber)
    && parsedSharedNumber >= 0;

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
          placeholder={t("adminMembers.sharedKitNumber")}
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

      {membersLoading || sharedNumbersLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("adminMembers.sharedKitNumbers")}</h2>
            <form
              className="flex max-w-xs items-center gap-2"
              onSubmit={event => {
                event.preventDefault();
                if (isSharedNumberValid) addSharedKitNumberMutation.mutate(parsedSharedNumber);
              }}
            >
              <Input
                type="number"
                min="0"
                step="1"
                value={sharedNumberDraft}
                onChange={event => setSharedNumberDraft(event.target.value)}
                placeholder={t("adminMembers.kitNumber")}
                aria-label={t("adminMembers.addSharedKitNumber")}
                data-testid="input-add-shared-kit-number"
              />
              <Button type="submit" size="sm" disabled={!isSharedNumberValid || addSharedKitNumberMutation.isPending}>
                <Plus className="mr-1 h-4 w-4" />{t("adminMembers.addSharedKitNumber")}
              </Button>
            </form>
            <div className="flex min-h-12 flex-wrap items-center gap-2">
              {sharedKitNumbers.length ? sharedKitNumbers.map(kitNumber => (
                <div key={kitNumber} className="flex items-center gap-1 rounded-md border px-2 py-1">
                  <span className="text-sm font-semibold">#{kitNumber}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={t("adminMembers.removeSharedKitNumber", { number: kitNumber })}
                    disabled={removeSharedKitNumberMutation.isPending}
                    onClick={() => removeSharedKitNumberMutation.mutate(kitNumber)}
                    data-testid={`button-remove-shared-kit-number-${kitNumber}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">{t("adminMembers.noSharedKitNumbers")}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("adminMembers.kitNumberMembers")}</h2>
            <div className="divide-y rounded-md border px-3">
              {activeMembers.length ? activeMembers.map(renderMember) : (
                <p className="py-3 text-sm text-muted-foreground">{t("adminMembers.noActiveKitNumberMembers")}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}