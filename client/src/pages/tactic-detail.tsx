import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { useI18n } from "@/lib/i18n";
import { ArrowDown, ArrowLeft, ArrowUp, FileText, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppPdfViewer } from "./tactic-pdf";

interface TacticDetail {
  id: number;
  title: string;
  description: string | null;
  createdAt: string;
  files: Array<{
    id: number;
    originalName: string;
    mimeType: string;
    url: string;
  }>;
}

export default function TacticDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOrder, setEditOrder] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const { data: tactic, isLoading, error } = useQuery<TacticDetail>({
    queryKey: ["/api/media/tactics", id],
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/media/tactics/${id}`, { method: "PUT", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(data?.message || t("tacticDetail.updateFailed"));
      }
      return response.json() as Promise<TacticDetail>;
    },
    onSuccess: updated => {
      queryClient.setQueryData(["/api/media/tactics", id], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      setEditOpen(false);
      setNewFiles([]);
      toast({ title: t("tacticDetail.updated") });
    },
    onError: (mutationError: Error) => toast({ title: t("tacticDetail.updateFailedShort"), description: mutationError.message, variant: "destructive" }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/media/tactics/${id}/files/${fileId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(data?.message || t("tacticDetail.fileDeleteFailed"));
      }
      return response.json() as Promise<TacticDetail>;
    },
    onSuccess: (updated, deletedFileId) => {
      queryClient.setQueryData(["/api/media/tactics", id], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      setEditOrder(previous => previous.filter(fileId => fileId !== deletedFileId));
      toast({ title: t("tacticDetail.fileDeleted") });
    },
    onError: (mutationError: Error) => toast({ title: t("tacticDetail.deleteFailed"), description: mutationError.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">{t("tacticDetail.loading")}</p>;
  }

  if (error || !tactic) {
    return (
      <div className="space-y-4">
        <Link href="/files"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t("common.back")}</Button></Link>
        <p className="text-sm text-destructive">{t("tacticDetail.loadFailed")}</p>
      </div>
    );
  }

  const openEdit = () => {
    setEditTitle(tactic.title);
    setEditDescription(tactic.description || "");
    setEditOrder(tactic.files.map(file => file.id));
    setNewFiles([]);
    setEditOpen(true);
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= editOrder.length) return;
    setEditOrder(previous => {
      const next = [...previous];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const saveEdit = () => {
    const formData = new FormData();
    formData.append("title", editTitle);
    formData.append("description", editDescription);
    formData.append("fileOrder", JSON.stringify(editOrder));
    newFiles.forEach(file => formData.append("images", file));
    updateMutation.mutate(formData);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/files">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />{t("tacticDetail.backToFiles")}
          </Button>
        </Link>
        {user?.role === "admin" && (
          <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="w-4 h-4 mr-1" />{t("common.edit")}</Button>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary"><FolderOpen className="w-3.5 h-3.5 mr-1" />{t("tacticDetail.badge")}</Badge>
          <span className="text-xs text-muted-foreground">{tactic.files.length} {tactic.files.length === 1 ? t("tacticDetail.fileOne") : t("tacticDetail.fileMany")}</span>
        </div>
        <h1 className="font-serif text-xl font-bold">{tactic.title}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t("tacticDetail.addedOn", { date: format(parseISO(tactic.createdAt), "d. MMMM yyyy", { locale: dateLocale }) })}</p>
        {tactic.description && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{tactic.description}</p>}
      </div>

      <div className="space-y-5">
        {tactic.files.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t("tacticDetail.noFiles")}
            </CardContent>
          </Card>
        )}
        {tactic.files.map((file, index) => (
          <Card key={file.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-2 border-b flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t("tacticDetail.fileXOfY", { index: index + 1, total: tactic.files.length })}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{file.originalName}</span>
                  {user?.role === "admin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive shrink-0"
                      disabled={deleteFileMutation.isPending}
                      onClick={() => { if (confirm(t("tacticDetail.deleteFileConfirm"))) deleteFileMutation.mutate(file.id); }}
                      title={t("tacticDetail.deleteFileTitle")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              {file.mimeType === "application/pdf" ? (
                <div>
                  <AppPdfViewer url={file.url} title={`${tactic.title} – ${file.originalName}`} />
                  <div className="p-3 border-t flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{file.originalName}</span>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/files/tactics/${tactic.id}/pdf/${file.id}`}><FileText className="w-4 h-4 mr-1" />{t("tacticDetail.openPdf")}</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <img src={file.url} alt={t("tacticDetail.fileAlt", { title: tactic.title, index: index + 1 })} loading="lazy" className="w-full h-auto bg-white object-contain" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("tacticDetail.editTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tactic-title">{t("calendar.name")}</Label>
              <Input id="edit-tactic-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tactic-description">{t("tacticDetail.description")}</Label>
              <Textarea id="edit-tactic-description" value={editDescription} onChange={event => setEditDescription(event.target.value)} rows={3} maxLength={1000} />
            </div>
            <div className="space-y-2">
              <Label>{t("tacticDetail.fileOrder")}</Label>
              <div className="space-y-2">
                {editOrder.map((fileId, index) => {
                  const file = tactic.files.find(candidate => candidate.id === fileId);
                  if (!file) return null;
                  return (
                    <div key={file.id} className="flex items-center gap-2 rounded-lg border p-2">
                      <span className="w-6 text-center text-xs text-muted-foreground">{index + 1}.</span>
                      <span className="flex-1 min-w-0 truncate text-sm">{file.originalName}</span>
                      <Button variant="ghost" size="icon" className="w-8 h-8" disabled={index === 0} onClick={() => moveFile(index, -1)} aria-label={t("tacticDetail.moveUpAria")}><ArrowUp className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8" disabled={index === editOrder.length - 1} onClick={() => moveFile(index, 1)} aria-label={t("tacticDetail.moveDownAria")}><ArrowDown className="w-4 h-4" /></Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive"
                        disabled={deleteFileMutation.isPending}
                        onClick={() => { if (confirm(t("tacticDetail.deleteFileConfirm"))) deleteFileMutation.mutate(file.id); }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />{t("common.delete")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tactic-files">{t("tacticDetail.addFiles")}</Label>
              <Input id="edit-tactic-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple onChange={event => setNewFiles(Array.from(event.target.files || []))} />
              {newFiles.length > 0 && <p className="text-xs text-muted-foreground">{t("tacticDetail.newFiles", { count: newFiles.length })}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit} disabled={!editTitle.trim() || updateMutation.isPending}>{updateMutation.isPending ? t("common.saving") : t("tacticDetail.saveChanges")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
