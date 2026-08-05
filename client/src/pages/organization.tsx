import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, BellRing, Boxes, ClipboardList, MapPin,
  Pencil, Plus, Trash2, UserRound,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ResponsibilityKind = "responsibility" | "inventory";
type ResponsibilityStatus = "ok" | "attention" | "done";

interface ResponsibilityOwner {
  id: number;
  name: string;
}

interface InventoryItem {
  id: number;
  responsibilityId: number;
  name: string;
  status: ResponsibilityStatus;
  quantity: number | null;
  usableQuantity: number | null;
  location: string | null;
  notes: string | null;
  sortOrder: number;
}

interface Responsibility {
  id: number;
  section: string;
  title: string;
  kind: ResponsibilityKind;
  status: ResponsibilityStatus;
  owner: string | null;
  owners: ResponsibilityOwner[];
  inventoryItems: InventoryItem[];
  notes: string | null;
  quantity: number | null;
  usableQuantity: number | null;
  location: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface UserItem {
  id: number;
  name: string;
  isActive: boolean;
}

interface ResponsibilityForm {
  section: string;
  title: string;
  kind: ResponsibilityKind;
  status: ResponsibilityStatus;
  owner: string;
  ownerIds: number[];
  notes: string;
}

interface InventoryItemForm {
  name: string;
  status: ResponsibilityStatus;
  quantity: string;
  usableQuantity: string;
  location: string;
  notes: string;
}

const emptyForm: ResponsibilityForm = {
  section: "",
  title: "",
  kind: "responsibility",
  status: "ok",
  owner: "",
  ownerIds: [],
  notes: "",
};

const emptyInventoryForm: InventoryItemForm = {
  name: "",
  status: "ok",
  quantity: "",
  usableQuantity: "",
  location: "",
  notes: "",
};

function statusBadgeClass(status: ResponsibilityStatus) {
  return status === "ok"
    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "attention"
      ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

export default function OrganizationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const statusLabel = (status: ResponsibilityStatus) =>
    status === "ok"
      ? t("organization.statusOk")
      : status === "attention"
        ? t("organization.statusAttention")
        : t("organization.statusDone");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ResponsibilityForm>(emptyForm);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [inventoryParentId, setInventoryParentId] = useState<number | null>(null);
  const [editingInventoryId, setEditingInventoryId] = useState<number | null>(null);
  const [inventoryForm, setInventoryForm] = useState<InventoryItemForm>(emptyInventoryForm);

  const { data: responsibilities = [], isLoading } = useQuery<Responsibility[]>({
    queryKey: ["/api/organization"],
  });
  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });
  const activeUsers = users.filter(candidate => candidate.isActive);

  const groupedResponsibilities = responsibilities.reduce<Array<{ section: string; items: Responsibility[] }>>((groups, item) => {
    const currentGroup = groups.find(group => group.section === item.section);
    if (currentGroup) currentGroup.items.push(item);
    else groups.push({ section: item.section, items: [item] });
    return groups;
  }, []);
  const sectionNames = groupedResponsibilities.map(group => group.section);

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: ResponsibilityForm }) =>
      apiRequest(id === null ? "POST" : "PUT", id === null ? "/api/organization" : `/api/organization/${id}`, data),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: variables.id === null ? t("organization.itemAdded") : t("organization.itemUpdated") });
      closeDialog();
    },
    onError: (error: Error) => toast({ title: t("organization.itemSaveFailed"), description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/organization/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: t("organization.itemDeleted") });
    },
    onError: (error: Error) => toast({ title: t("organization.itemDeleteFailed"), description: error.message, variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("PUT", "/api/organization/order", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/organization"] }),
    onError: (error: Error) => toast({ title: t("organization.orderSaveFailed"), description: error.message, variant: "destructive" }),
  });

  const remindMutation = useMutation({
    mutationFn: async (item: Responsibility) => {
      const response = await apiRequest("POST", `/api/organization/${item.id}/remind`);
      return response.json() as Promise<{ recipientCount: number }>;
    },
    onSuccess: result => toast({ title: t("organization.reminderSent"), description: t("organization.reminderRecipients", { count: result.recipientCount }) }),
    onError: (error: Error) => toast({ title: t("organization.reminderSendFailed"), description: error.message, variant: "destructive" }),
  });

  const saveInventoryMutation = useMutation({
    mutationFn: ({ parentId, itemId, data }: { parentId: number; itemId: number | null; data: InventoryItemForm }) =>
      apiRequest(
        itemId === null ? "POST" : "PUT",
        itemId === null ? `/api/organization/${parentId}/inventory` : `/api/organization/${parentId}/inventory/${itemId}`,
        data,
      ),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: variables.itemId === null ? t("organization.thingAdded") : t("organization.thingUpdated") });
      closeInventoryDialog();
    },
    onError: (error: Error) => toast({ title: t("organization.thingSaveFailed"), description: error.message, variant: "destructive" }),
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: ({ parentId, itemId }: { parentId: number; itemId: number }) =>
      apiRequest("DELETE", `/api/organization/${parentId}/inventory/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: t("organization.thingDeleted") });
    },
    onError: (error: Error) => toast({ title: t("organization.thingDeleteFailed"), description: error.message, variant: "destructive" }),
  });

  const reorderInventoryMutation = useMutation({
    mutationFn: ({ parentId, ids }: { parentId: number; ids: number[] }) =>
      apiRequest("PUT", `/api/organization/${parentId}/inventory/order`, { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/organization"] }),
    onError: (error: Error) => toast({ title: t("organization.thingsOrderSaveFailed"), description: error.message, variant: "destructive" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function closeInventoryDialog() {
    setInventoryDialogOpen(false);
    setInventoryParentId(null);
    setEditingInventoryId(null);
    setInventoryForm(emptyInventoryForm);
  }

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: Responsibility) => {
    setEditingId(item.id);
    setForm({
      section: item.section,
      title: item.title,
      kind: item.kind,
      status: item.status,
      owner: item.owner || "",
      ownerIds: item.owners.map(owner => owner.id),
      notes: item.notes || "",
    });
    setDialogOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({ id: editingId, data: form });
  };

  const openCreateInventoryDialog = (parentId: number) => {
    setInventoryParentId(parentId);
    setEditingInventoryId(null);
    setInventoryForm(emptyInventoryForm);
    setInventoryDialogOpen(true);
  };

  const openEditInventoryDialog = (parentId: number, item: InventoryItem) => {
    setInventoryParentId(parentId);
    setEditingInventoryId(item.id);
    setInventoryForm({
      name: item.name,
      status: item.status,
      quantity: item.quantity === null ? "" : String(item.quantity),
      usableQuantity: item.usableQuantity === null ? "" : String(item.usableQuantity),
      location: item.location || "",
      notes: item.notes || "",
    });
    setInventoryDialogOpen(true);
  };

  const submitInventoryItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (inventoryParentId === null) return;
    saveInventoryMutation.mutate({ parentId: inventoryParentId, itemId: editingInventoryId, data: inventoryForm });
  };

  const moveInventoryItem = (parentId: number, items: InventoryItem[], itemIndex: number, direction: -1 | 1) => {
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const reordered = [...items];
    [reordered[itemIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[itemIndex]];
    reorderInventoryMutation.mutate({ parentId, ids: reordered.map(item => item.id) });
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    const targetIndex = sectionIndex + direction;
    if (targetIndex < 0 || targetIndex >= groupedResponsibilities.length) return;
    const reorderedGroups = groupedResponsibilities.map(group => ({ ...group, items: [...group.items] }));
    [reorderedGroups[sectionIndex], reorderedGroups[targetIndex]] = [reorderedGroups[targetIndex], reorderedGroups[sectionIndex]];
    reorderMutation.mutate(reorderedGroups.flatMap(group => group.items.map(item => item.id)));
  };

  const moveItem = (sectionIndex: number, itemIndex: number, direction: -1 | 1) => {
    const targetIndex = itemIndex + direction;
    const group = groupedResponsibilities[sectionIndex];
    if (targetIndex < 0 || targetIndex >= group.items.length) return;
    const reorderedGroups = groupedResponsibilities.map(current => ({ ...current, items: [...current.items] }));
    [reorderedGroups[sectionIndex].items[itemIndex], reorderedGroups[sectionIndex].items[targetIndex]] = [
      reorderedGroups[sectionIndex].items[targetIndex],
      reorderedGroups[sectionIndex].items[itemIndex],
    ];
    reorderMutation.mutate(reorderedGroups.flatMap(current => current.items.map(item => item.id)));
  };

  const toggleOwner = (userId: number, checked: boolean) => {
    setForm(current => ({
      ...current,
      ownerIds: checked
        ? Array.from(new Set([...current.ownerIds, userId]))
        : current.ownerIds.filter(id => id !== userId),
    }));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl font-bold">{t("organization.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("organization.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreateDialog} data-testid="button-add-responsibility">
            <Plus className="w-4 h-4 mr-1" />{t("organization.add")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("organization.loading")}</CardContent></Card>
      ) : groupedResponsibilities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("organization.none")}</p>
          </CardContent>
        </Card>
      ) : (
        groupedResponsibilities.map((group, sectionIndex) => (
          <section key={group.section} className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">{group.section}</h2>
              <Badge variant="secondary">{group.items.length}</Badge>
              {isAdmin && (
                <div className="flex items-center ml-auto">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={sectionIndex === 0 || reorderMutation.isPending} onClick={() => moveSection(sectionIndex, -1)} aria-label={t("organization.moveSectionUp", { section: group.section })}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={sectionIndex === groupedResponsibilities.length - 1 || reorderMutation.isPending} onClick={() => moveSection(sectionIndex, 1)} aria-label={t("organization.moveSectionDown", { section: group.section })}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item, itemIndex) => {
                const ownerNames = Array.from(new Set([
                  ...item.owners.map(owner => owner.name),
                  ...(item.owner ? [item.owner] : []),
                ]));
                const inventoryNeedsAttention = item.inventoryItems.some(inventoryItem => inventoryItem.status === "attention");
                return (
                  <Card key={item.id} className={`h-full ${item.kind === "inventory" ? "sm:col-span-2" : ""}`} data-testid={`responsibility-${item.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2 min-w-0">
                          <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
                          <div className="flex flex-wrap gap-1.5">
                            {item.kind === "responsibility" ? (
                              <Badge variant="outline" className={statusBadgeClass(item.status)}>{statusLabel(item.status)}</Badge>
                            ) : (
                              <>
                                <Badge variant="secondary"><Boxes className="w-3 h-3 mr-1" />{t("organization.inventoryBadge", { count: item.inventoryItems.length })}</Badge>
                                {inventoryNeedsAttention && <Badge variant="outline" className={statusBadgeClass("attention")}>{t("organization.statusAttention")}</Badge>}
                              </>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex flex-wrap justify-end gap-0.5 shrink-0 max-w-28">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={item.owners.length === 0 || remindMutation.isPending}
                              onClick={() => confirm(t("organization.remindConfirm", { names: item.owners.map(owner => owner.name).join(", ") })) && remindMutation.mutate(item)}
                              aria-label={t("organization.remindAria", { title: item.title })}
                              title={item.owners.length === 0 ? t("organization.remindTitleEmpty") : t("organization.remindTitle")}
                            >
                              <BellRing className="w-4 h-4" />
                            </Button>
                            {item.kind === "inventory" && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCreateInventoryDialog(item.id)} aria-label={t("organization.addThingTo", { title: item.title })} title={t("organization.addThing")}>
                                <Plus className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)} aria-label={t("organization.editAria", { title: item.title })}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirm(t("organization.deleteConfirm", { title: item.title })) && deleteMutation.mutate(item.id)} aria-label={t("organization.deleteAria", { title: item.title })}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={itemIndex === 0 || reorderMutation.isPending} onClick={() => moveItem(sectionIndex, itemIndex, -1)} aria-label={t("organization.moveUp", { title: item.title })}>
                              <ArrowUp className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={itemIndex === group.items.length - 1 || reorderMutation.isPending} onClick={() => moveItem(sectionIndex, itemIndex, 1)} aria-label={t("organization.moveDown", { title: item.title })}>
                              <ArrowDown className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {ownerNames.length > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1">
                          <UserRound className="w-4 h-4 shrink-0" />
                          <span>{t("organization.responsibleFor")}: <strong className="font-medium text-foreground">{ownerNames.join(", ")}</strong></span>
                        </div>
                      )}
                    </CardHeader>
                    {(item.kind === "inventory" || item.notes) && (
                      <CardContent className="space-y-3">
                        {item.kind === "inventory" && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("organization.thingsInInventory")}</p>
                              {isAdmin && (
                                <Button variant="outline" size="sm" className="h-8" onClick={() => openCreateInventoryDialog(item.id)}>
                                  <Plus className="w-3.5 h-3.5 mr-1" />{t("organization.addThing")}
                                </Button>
                              )}
                            </div>
                            {item.inventoryItems.length === 0 ? (
                              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t("organization.inventoryEmpty")}</div>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {item.inventoryItems.map((inventoryItem, inventoryIndex) => (
                                  <div key={inventoryItem.id} className="rounded-lg border p-3 space-y-2" data-testid={`inventory-item-${inventoryItem.id}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium leading-snug">{inventoryItem.name}</p>
                                        <Badge variant="outline" className={`mt-1.5 ${statusBadgeClass(inventoryItem.status)}`}>{statusLabel(inventoryItem.status)}</Badge>
                                      </div>
                                      {isAdmin && (
                                        <div className="flex flex-wrap justify-end gap-0.5 shrink-0 max-w-20">
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditInventoryDialog(item.id, inventoryItem)} aria-label={t("organization.editAria", { title: inventoryItem.name })}>
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => confirm(t("organization.deleteConfirm", { title: inventoryItem.name })) && deleteInventoryMutation.mutate({ parentId: item.id, itemId: inventoryItem.id })} aria-label={t("organization.deleteAria", { title: inventoryItem.name })}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={inventoryIndex === 0 || reorderInventoryMutation.isPending} onClick={() => moveInventoryItem(item.id, item.inventoryItems, inventoryIndex, -1)} aria-label={t("organization.moveUp", { title: inventoryItem.name })}>
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={inventoryIndex === item.inventoryItems.length - 1 || reorderInventoryMutation.isPending} onClick={() => moveInventoryItem(item.id, item.inventoryItems, inventoryIndex, 1)} aria-label={t("organization.moveDown", { title: inventoryItem.name })}>
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                      {inventoryItem.quantity !== null && <span>{t("organization.quantity")}: <strong className="text-foreground">{inventoryItem.quantity}</strong></span>}
                                      {inventoryItem.usableQuantity !== null && <span>{t("organization.usable")}: <strong className="text-foreground">{inventoryItem.usableQuantity}</strong></span>}
                                      {inventoryItem.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{inventoryItem.location}</span>}
                                    </div>
                                    {inventoryItem.notes && <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{inventoryItem.notes}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {item.notes && (
                          <div className="border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">{t("organization.generalNote")}</p>
                            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{item.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={open => open ? setDialogOpen(true) : closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId === null ? t("organization.newItem") : t("organization.editItem")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="responsibility-section">{t("organization.sectionLabel")}</Label>
                <Input id="responsibility-section" list="organization-sections" value={form.section} onChange={event => setForm({ ...form, section: event.target.value })} maxLength={80} placeholder={t("organization.sectionPlaceholder")} required data-testid="input-responsibility-section" />
                <datalist id="organization-sections">{sectionNames.map(section => <option key={section} value={section} />)}</datalist>
              </div>
              <div className="space-y-2">
                <Label>{t("organization.kindLabel")}</Label>
                <Select value={form.kind} onValueChange={value => setForm({ ...form, kind: value as ResponsibilityKind })}>
                  <SelectTrigger data-testid="select-responsibility-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responsibility">{t("organization.kindResponsibility")}</SelectItem>
                    <SelectItem value="inventory">{t("organization.kindInventory")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsibility-title">{t("calendar.name")}</Label>
              <Input id="responsibility-title" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} maxLength={160} placeholder={t("organization.titlePlaceholder")} required data-testid="input-responsibility-title" />
            </div>

            {form.kind === "responsibility" && (
              <div className="space-y-2">
                <Label>{t("organization.statusLabel")}</Label>
                <Select value={form.status} onValueChange={value => setForm({ ...form, status: value as ResponsibilityStatus })}>
                  <SelectTrigger data-testid="select-responsibility-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">{t("organization.statusOk")}</SelectItem>
                    <SelectItem value="attention">{t("organization.statusAttention")}</SelectItem>
                    <SelectItem value="done">{t("organization.statusDone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("organization.ownersLabel")}</Label>
              <div className="rounded-md border p-3 max-h-40 overflow-y-auto space-y-2">
                {activeUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("organization.noActiveMembers")}</p>
                ) : activeUsers.map(candidate => (
                  <label key={candidate.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.ownerIds.includes(candidate.id)} onCheckedChange={checked => toggleOwner(candidate.id, checked === true)} />
                    {candidate.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("organization.ownersHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsibility-owner">{t("organization.ownerFieldLabel", { optional: t("common.optional") })}</Label>
              <Input id="responsibility-owner" value={form.owner} onChange={event => setForm({ ...form, owner: event.target.value })} maxLength={160} placeholder={t("organization.ownerPlaceholder")} data-testid="input-responsibility-owner" />
            </div>

            {form.kind === "inventory" && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                {t("organization.inventoryHint")}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="responsibility-notes">{t("organization.notesLabel")}</Label>
              <Textarea id="responsibility-notes" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} maxLength={10_000} rows={8} placeholder={t("organization.notesPlaceholder")} data-testid="input-responsibility-notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-responsibility">
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={inventoryDialogOpen} onOpenChange={open => open ? setInventoryDialogOpen(true) : closeInventoryDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInventoryId === null ? t("organization.newThing") : t("organization.editThing")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitInventoryItem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inventory-item-name">{t("organization.thingNameLabel")}</Label>
              <Input id="inventory-item-name" value={inventoryForm.name} onChange={event => setInventoryForm({ ...inventoryForm, name: event.target.value })} maxLength={160} placeholder={t("organization.thingNamePlaceholder")} required data-testid="input-inventory-item-name" />
            </div>
            <div className="space-y-2">
              <Label>{t("organization.statusLabel")}</Label>
              <Select value={inventoryForm.status} onValueChange={value => setInventoryForm({ ...inventoryForm, status: value as ResponsibilityStatus })}>
                <SelectTrigger data-testid="select-inventory-item-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">{t("organization.statusOk")}</SelectItem>
                  <SelectItem value="attention">{t("organization.statusAttention")}</SelectItem>
                  <SelectItem value="done">{t("organization.statusDone")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-item-quantity">{t("organization.totalQuantity")}</Label>
                <Input id="inventory-item-quantity" type="number" min="0" step="1" value={inventoryForm.quantity} onChange={event => setInventoryForm({ ...inventoryForm, quantity: event.target.value })} data-testid="input-inventory-item-quantity" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventory-item-usable-quantity">{t("organization.usableQuantity")}</Label>
                <Input id="inventory-item-usable-quantity" type="number" min="0" step="1" value={inventoryForm.usableQuantity} onChange={event => setInventoryForm({ ...inventoryForm, usableQuantity: event.target.value })} data-testid="input-inventory-item-usable-quantity" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-location">{t("organization.locationLabel")}</Label>
              <Input id="inventory-item-location" value={inventoryForm.location} onChange={event => setInventoryForm({ ...inventoryForm, location: event.target.value })} maxLength={200} placeholder={t("organization.locationPlaceholder")} data-testid="input-inventory-item-location" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-notes">{t("organization.notesLabelShort")}</Label>
              <Textarea id="inventory-item-notes" value={inventoryForm.notes} onChange={event => setInventoryForm({ ...inventoryForm, notes: event.target.value })} maxLength={2_000} rows={4} placeholder={t("organization.notesPlaceholderShort")} data-testid="input-inventory-item-notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeInventoryDialog}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={saveInventoryMutation.isPending} data-testid="button-save-inventory-item">
                {saveInventoryMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
