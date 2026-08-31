import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { ArrowLeft, ChevronRight, FileText, FolderOpen, FolderPlus, Image, Images, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canManageTeam } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MediaFile {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  collectionId: number | null;
}

interface PhotoAlbum {
  id: number;
  title: string;
  createdAt: string;
  files: MediaFile[];
}

interface TacticCollection {
  id: number;
  title: string;
  description: string | null;
  createdAt: string;
  files: MediaFile[];
}

async function uploadForm(url: string, formData: FormData, fallbackMessage: string) {
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message || fallbackMessage);
  }
  return response.json();
}

async function deleteMedia(url: string, fallbackMessage: string) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message || fallbackMessage);
  }
}

export default function MediaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { lang, t } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const queryClient = useQueryClient();
  const isAdmin = canManageTeam(user?.role);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [tacticUploadOpen, setTacticUploadOpen] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [tacticFiles, setTacticFiles] = useState<File[]>([]);
  const [tacticTitle, setTacticTitle] = useState("");
  const [tacticDescription, setTacticDescription] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<MediaFile | null>(null);
  const [openAlbumId, setOpenAlbumId] = useState<number | null>(null);
  const [uploadAlbumId, setUploadAlbumId] = useState<number | "none">("none");
  const [albumCreateOpen, setAlbumCreateOpen] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [renameAlbum, setRenameAlbum] = useState<PhotoAlbum | null>(null);
  const [renameName, setRenameName] = useState("");
  const [moveAlbumId, setMoveAlbumId] = useState<number | "none">("none");

  const { data: photos = [] } = useQuery<MediaFile[]>({ queryKey: ["/api/media/photos"] });
  const { data: albums = [] } = useQuery<PhotoAlbum[]>({ queryKey: ["/api/media/albums"] });
  const { data: tactics = [] } = useQuery<TacticCollection[]>({ queryKey: ["/api/media/tactics"] });

  const currentAlbum = openAlbumId ? albums.find(album => album.id === openAlbumId) ?? null : null;
  const totalPhotoCount = photos.length + albums.reduce((sum, album) => sum + album.files.length, 0);

  useEffect(() => {
    if (selectedPhoto) {
      setMoveAlbumId(selectedPhoto.collectionId ?? "none");
    }
  }, [selectedPhoto]);

  const photoUploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      photoFiles.forEach(file => formData.append("images", file));
      if (uploadAlbumId !== "none") formData.append("albumId", String(uploadAlbumId));
      return uploadForm("/api/media/photos", formData, t("media.uploadFailed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      setPhotoFiles([]);
      setPhotoUploadOpen(false);
      toast({ title: t("media.addPhotos") });
    },
    onError: (error: Error) => toast({ title: t("media.uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const createAlbumMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/media/albums", { name: albumName.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      setAlbumName("");
      setAlbumCreateOpen(false);
      toast({ title: t("media.folderCreated") });
    },
    onError: (error: Error) => toast({ title: t("media.uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const renameAlbumMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/media/albums/${renameAlbum!.id}`, { name: renameName.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      setRenameAlbum(null);
      toast({ title: t("media.folderRenamed") });
    },
    onError: (error: Error) => toast({ title: t("media.uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(`/api/media/albums/${id}`, t("media.deleteFailed")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      setOpenAlbumId(null);
      toast({ title: t("media.folderDeleted") });
    },
    onError: (error: Error) => toast({ title: t("media.deleteFailed"), description: error.message, variant: "destructive" }),
  });

  const movePhotoMutation = useMutation({
    mutationFn: (photo: MediaFile) =>
      apiRequest("PATCH", `/api/media/photos/${photo.id}`, { albumId: moveAlbumId === "none" ? null : moveAlbumId }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      setSelectedPhoto(null);
      toast({ title: t("media.photoMoved") });
    },
    onError: (error: Error) => toast({ title: t("media.uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const openUploadDialog = (albumId: number | "none") => {
    setUploadAlbumId(albumId);
    setPhotoFiles([]);
    setPhotoUploadOpen(true);
  };

  const renderPhotoGrid = (files: MediaFile[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {files.map(photo => (
        <div key={photo.id} className="relative group overflow-hidden rounded-xl border bg-muted aspect-square">
          <button className="w-full h-full" onClick={() => setSelectedPhoto(photo)} aria-label={t("media.openPhoto", { name: photo.originalName })}>
            <img src={photo.url} alt={photo.originalName} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
          </button>
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              className="absolute right-2 top-2 h-8 px-2 shadow-md"
              onClick={() => { if (confirm(t("media.deletePhotoConfirm"))) deletePhotoMutation.mutate(photo.id); }}
              aria-label={t("media.deletePhotoAria")}
            >
              <Trash2 className="w-4 h-4 mr-1" />{t("media.deleteShort")}
            </Button>
          )}
        </div>
      ))}
    </div>
  );

  const tacticUploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("title", tacticTitle);
      formData.append("description", tacticDescription);
      tacticFiles.forEach(file => formData.append("images", file));
      return uploadForm("/api/media/tactics", formData, t("media.uploadFailed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      setTacticFiles([]);
      setTacticTitle("");
      setTacticDescription("");
      setTacticUploadOpen(false);
      toast({ title: t("media.newTactic") });
    },
    onError: (error: Error) => toast({ title: t("media.uploadFailed"), description: error.message, variant: "destructive" }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(`/api/media/photos/${id}`, t("media.deleteFailed")),
    onSuccess: (_result, deletedPhotoId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/albums"] });
      setSelectedPhoto(previous => previous?.id === deletedPhotoId ? null : previous);
      toast({ title: t("media.deletePhoto") });
    },
    onError: (error: Error) => toast({ title: t("media.deletePhotoAria"), description: error.message, variant: "destructive" }),
  });

  const deleteTacticMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(`/api/media/tactics/${id}`, t("media.deleteFailed")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      toast({ title: t("media.deleteTacticAria") });
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-xl font-bold">{t("layout.files")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("media.subtitle")}</p>
      </div>

      <Tabs defaultValue="photos" className="space-y-5">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="photos"><Image className="w-4 h-4 mr-1.5" />{t("media.photosTab", { count: totalPhotoCount })}</TabsTrigger>
          <TabsTrigger value="tactics"><FolderOpen className="w-4 h-4 mr-1.5" />{t("media.tacticsTab", { count: tactics.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t("media.galleryTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("media.gallerySubtitle")}</p>
            </div>
            {isAdmin && <Button size="sm" onClick={() => setAlbumCreateOpen(true)}><FolderPlus className="w-4 h-4 mr-1" />{t("media.newFolder")}</Button>}
          </div>

          {!currentAlbum ? (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t("media.folders")}</h3>
                {albums.length === 0 ? (
                  <Card><CardContent className="p-10 text-center"><FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{t("media.noFolders")}</p></CardContent></Card>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {albums.map(album => (
                      <Card key={album.id} className="overflow-hidden group cursor-pointer transition-shadow hover:shadow-md" onClick={() => setOpenAlbumId(album.id)}>
                        <div className="aspect-video bg-muted overflow-hidden">
                          {album.files[0] ? (
                            <img src={album.files[0].url} alt={album.title} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <FolderOpen className="w-10 h-10" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3 flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{album.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{album.files.length} {album.files.length === 1 ? t("media.photoOne") : t("media.photoMany")}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">{t("media.unassigned")}</h3>
                  {isAdmin && <Button size="sm" variant="outline" onClick={() => openUploadDialog("none")}><Plus className="w-4 h-4 mr-1" />{t("media.addPhotos")}</Button>}
                </div>
                {photos.length === 0 ? (
                  <Card><CardContent className="p-10 text-center"><Images className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{t("media.noPhotos")}</p></CardContent></Card>
                ) : (
                  renderPhotoGrid(photos)
                )}
              </section>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setOpenAlbumId(null)}><ArrowLeft className="w-4 h-4 mr-1" />{t("media.backToFolders")}</Button>
                  <h2 className="font-semibold truncate">{currentAlbum.title}</h2>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setRenameAlbum(currentAlbum); setRenameName(currentAlbum.title); }}><Pencil className="w-4 h-4 mr-1" />{t("media.renameFolder")}</Button>
                    <Button size="sm" onClick={() => openUploadDialog(currentAlbum.id)}><Plus className="w-4 h-4 mr-1" />{t("media.addPhotos")}</Button>
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm(t("media.deleteFolderConfirm"))) deleteAlbumMutation.mutate(currentAlbum.id); }}><Trash2 className="w-4 h-4 mr-1" />{t("media.deleteShort")}</Button>
                  </div>
                )}
              </div>
              {currentAlbum.files.length === 0 ? (
                <Card><CardContent className="p-10 text-center"><Images className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{t("media.noPhotosInFolder")}</p></CardContent></Card>
              ) : (
                renderPhotoGrid(currentAlbum.files)
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="tactics" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t("media.tacticsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("media.tacticsSubtitle")}</p>
            </div>
            {isAdmin && <Button size="sm" onClick={() => setTacticUploadOpen(true)}><Plus className="w-4 h-4 mr-1" />{t("media.newTactic")}</Button>}
          </div>

          {tactics.length === 0 ? (
            <Card><CardContent className="p-10 text-center"><FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{t("media.noTactics")}</p></CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tactics.map(tactic => (
                <Card key={tactic.id} className="relative overflow-hidden group">
                  <Link href={`/files/tactics/${tactic.id}`} className="block">
                    <div className="aspect-video bg-muted overflow-hidden">
                      {tactic.files[0]?.mimeType === "application/pdf" ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <FileText className="w-12 h-12 mb-2" />
                          <span className="text-xs font-medium">PDF</span>
                        </div>
                      ) : tactic.files[0] ? (
                        <img src={tactic.files[0].url} alt={tactic.title} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <FolderOpen className="w-10 h-10 text-muted-foreground m-auto mt-12" />
                      )}
                    </div>
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{tactic.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{tactic.files.length} {tactic.files.length === 1 ? t("media.fileOne") : t("media.fileMany")} · {format(parseISO(tactic.createdAt), "d. MMM yyyy", { locale: dateLocale })}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Link>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-2 top-2 w-8 h-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={() => { if (confirm(t("media.deleteTacticConfirm"))) deleteTacticMutation.mutate(tactic.id); }}
                      aria-label={t("media.deleteTacticAria")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={photoUploadOpen} onOpenChange={setPhotoUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("media.addPhotos")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="photo-files">{t("media.images")}</Label>
            <Input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={event => setPhotoFiles(Array.from(event.target.files || []))} />
            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="photo-folder">{t("media.folder")}</Label>
                <Select value={uploadAlbumId === "none" ? "none" : String(uploadAlbumId)} onValueChange={value => setUploadAlbumId(value === "none" ? "none" : Number(value))}>
                  <SelectTrigger id="photo-folder" className="w-full"><SelectValue placeholder={t("media.noFolder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("media.noFolder")}</SelectItem>
                    {albums.map(album => <SelectItem key={album.id} value={String(album.id)}>{album.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("media.photoHint")}</p>
            {photoFiles.length > 0 && <p className="text-sm">{t("media.selected", { count: photoFiles.length })}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoUploadOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => photoUploadMutation.mutate()} disabled={photoFiles.length === 0 || photoUploadMutation.isPending}>{photoUploadMutation.isPending ? t("media.uploading") : t("media.upload")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tacticUploadOpen} onOpenChange={setTacticUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("media.newTactic")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tactic-title">{t("calendar.name")}</Label>
              <Input id="tactic-title" value={tacticTitle} onChange={event => setTacticTitle(event.target.value)} placeholder={t("media.tacticTitlePlaceholder")} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tactic-description">{t("media.description")}</Label>
              <Textarea id="tactic-description" value={tacticDescription} onChange={event => setTacticDescription(event.target.value)} rows={3} maxLength={1000} placeholder={t("media.tacticDescPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tactic-files">{t("media.tacticFiles")}</Label>
              <Input id="tactic-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple onChange={event => setTacticFiles(Array.from(event.target.files || []))} />
              <p className="text-xs text-muted-foreground">{t("media.tacticFileHint")}</p>
              {tacticFiles.length > 0 && <p className="text-sm">{t("media.selected", { count: tacticFiles.length })}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTacticUploadOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => tacticUploadMutation.mutate()} disabled={!tacticTitle.trim() || tacticFiles.length === 0 || tacticUploadMutation.isPending}>{tacticUploadMutation.isPending ? t("calendar.creating") : t("media.createTactic")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPhoto} onOpenChange={open => { if (!open) setSelectedPhoto(null); }}>
        <DialogContent className="max-w-5xl p-2 sm:p-4">
          <DialogHeader className="sr-only"><DialogTitle>{selectedPhoto?.originalName || t("media.photo")}</DialogTitle></DialogHeader>
          {selectedPhoto && <img src={selectedPhoto.url} alt={selectedPhoto.originalName} className="max-h-[85vh] w-full object-contain rounded-lg" />}
          {isAdmin && selectedPhoto && (
            <DialogFooter className="px-2 pb-1 flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-[220px] flex-1 sm:flex-none">
                <Label htmlFor="photo-move-folder" className="shrink-0 text-xs">{t("media.folder")}</Label>
                <Select value={moveAlbumId === "none" ? "none" : String(moveAlbumId)} onValueChange={value => setMoveAlbumId(value === "none" ? "none" : Number(value))}>
                  <SelectTrigger id="photo-move-folder" className="w-full"><SelectValue placeholder={t("media.noFolder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("media.noFolder")}</SelectItem>
                    {albums.map(album => <SelectItem key={album.id} value={String(album.id)}>{album.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => movePhotoMutation.mutate(selectedPhoto)} disabled={movePhotoMutation.isPending}>{t("media.move")}</Button>
              </div>
              <Button
                variant="destructive"
                onClick={() => { if (confirm(t("media.deletePhotoConfirm"))) deletePhotoMutation.mutate(selectedPhoto.id); }}
                disabled={deletePhotoMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />{deletePhotoMutation.isPending ? t("media.deleting") : t("media.deletePhoto")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={albumCreateOpen} onOpenChange={setAlbumCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("media.newFolder")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="album-name">{t("media.folderName")}</Label>
            <Input id="album-name" value={albumName} onChange={event => setAlbumName(event.target.value)} placeholder={t("media.folderNamePlaceholder")} maxLength={100} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlbumCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => createAlbumMutation.mutate()} disabled={!albumName.trim() || createAlbumMutation.isPending}>{createAlbumMutation.isPending ? t("media.uploading") : t("media.createFolder")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameAlbum} onOpenChange={open => { if (!open) setRenameAlbum(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("media.renameFolder")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-album-name">{t("media.folderName")}</Label>
            <Input id="rename-album-name" value={renameName} onChange={event => setRenameName(event.target.value)} maxLength={100} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameAlbum(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => renameAlbumMutation.mutate()} disabled={!renameName.trim() || renameAlbumMutation.isPending}>{renameAlbumMutation.isPending ? t("media.uploading") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
