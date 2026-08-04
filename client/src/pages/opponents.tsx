import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Pencil,
  Plus,
  Swords,
  Trash2,
  Users,
  X,
  Check,
} from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Opponent {
  id: number;
  name: string;
}

export default function OpponentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";

  const [newOpponentName, setNewOpponentName] = useState("");
  const [editingOpponentId, setEditingOpponentId] = useState<number | null>(
    null,
  );
  const [editingOpponentName, setEditingOpponentName] = useState("");

  const {
    data: opponents = [],
    isLoading,
    isError,
  } = useQuery<Opponent[]>({
    queryKey: ["/api/opponents"],
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/opponents", {
        name,
      }),
    onSuccess: () => {
      setNewOpponentName("");

      queryClient.invalidateQueries({
        queryKey: ["/api/opponents"],
      });

      toast({
        title: "Súper bol pridaný",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Súpera sa nepodarilo pridať",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      name,
    }: {
      id: number;
      name: string;
    }) =>
      apiRequest("PATCH", `/api/opponents/${id}`, {
        name,
      }),
    onSuccess: () => {
      setEditingOpponentId(null);
      setEditingOpponentName("");

      queryClient.invalidateQueries({
        queryKey: ["/api/opponents"],
      });

      toast({
        title: "Súper bol upravený",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Súpera sa nepodarilo upraviť",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/opponents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/opponents"],
      });

      toast({
        title: "Súper bol odstránený",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Súpera sa nepodarilo odstrániť",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const handleCreateOpponent = () => {
    const trimmedName = newOpponentName.trim();

    if (!trimmedName) {
      toast({
        title: "Zadaj názov súpera",
        variant: "destructive",
      });

      return;
    }

    createMutation.mutate(trimmedName);
  };

  const startEditing = (opponent: Opponent) => {
    setEditingOpponentId(opponent.id);
    setEditingOpponentName(opponent.name);
  };

  const cancelEditing = () => {
    setEditingOpponentId(null);
    setEditingOpponentName("");
  };

  const saveOpponent = () => {
    const trimmedName = editingOpponentName.trim();

    if (!editingOpponentId || !trimmedName) {
      toast({
        title: "Názov súpera nemôže byť prázdny",
        variant: "destructive",
      });

      return;
    }

    updateMutation.mutate({
      id: editingOpponentId,
      name: trimmedName,
    });
  };

  const handleDeleteOpponent = (opponent: Opponent) => {
    const confirmed = window.confirm(
      `Naozaj chceš odstrániť súpera „${opponent.name}“?`,
    );

    if (confirmed) {
      deleteMutation.mutate(opponent.id);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Súperi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zoznam súperov tímu O5MY
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>

            <div>
              <p className="text-xl font-bold">{opponents.length}</p>
              <p className="text-xs text-muted-foreground">
                Počet súperov
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateOpponent();
              }}
            >
              <Input
                value={newOpponentName}
                onChange={(event) =>
                  setNewOpponentName(event.target.value)
                }
                placeholder="Názov nového súpera"
                disabled={isMutating}
                maxLength={100}
              />

              <Button
                type="submit"
                disabled={!newOpponentName.trim() || isMutating}
              >
                <Plus className="w-4 h-4 mr-2" />
                Pridať súpera
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Načítavam súperov…
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">
            Súperov sa nepodarilo načítať.
          </CardContent>
        </Card>
      ) : opponents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-3" />

            <p className="text-sm text-muted-foreground">
              Zatiaľ nie sú pridaní žiadni súperi
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {opponents.map((opponent) => {
            const isEditing = editingOpponentId === opponent.id;

            return (
              <Card
                key={opponent.id}
                data-testid={`opponent-${opponent.id}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Swords className="w-5 h-5" />
                  </div>

                  {isEditing ? (
                    <Input
                      value={editingOpponentName}
                      onChange={(event) =>
                        setEditingOpponentName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          saveOpponent();
                        }

                        if (event.key === "Escape") {
                          cancelEditing();
                        }
                      }}
                      disabled={updateMutation.isPending}
                      className="flex-1"
                      maxLength={100}
                      autoFocus
                    />
                  ) : (
                    <p className="font-medium flex-1 truncate">
                      {opponent.name}
                    </p>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={cancelEditing}
                            disabled={updateMutation.isPending}
                            aria-label="Zrušiť úpravu"
                          >
                            <X className="w-4 h-4" />
                          </Button>

                          <Button
                            type="button"
                            size="icon"
                            className="h-9 w-9"
                            onClick={saveOpponent}
                            disabled={
                              !editingOpponentName.trim() ||
                              updateMutation.isPending
                            }
                            aria-label="Uložiť súpera"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => startEditing(opponent)}
                            disabled={isMutating}
                            aria-label={`Upraviť súpera ${opponent.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() =>
                              handleDeleteOpponent(opponent)
                            }
                            disabled={isMutating}
                            aria-label={`Odstrániť súpera ${opponent.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}