import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";
import { ChevronRight, FileText, FolderOpen, Image, Images, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MediaFile {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
}

interface TacticCollection {
  id: number;
  title: string;
  description: string | null;
  createdAt: string;
  files: MediaFile[];
}

async function uploadForm(url: string, formData: FormData) {
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message || "Nahrávanie zlyhalo");
  }
  return response.json();
}

async function deleteMedia(url: string) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message || "Mazanie zlyhalo");
  }
}

export default function MediaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [tacticUploadOpen, setTacticUploadOpen] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [tacticFiles, setTacticFiles] = useState<File[]>([]);
  const [tacticTitle, setTacticTitle] = useState("");
  const [tacticDescription, setTacticDescription] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<MediaFile | null>(null);

  const { data: photos = [] } = useQuery<MediaFile[]>({ queryKey: ["/api/media/photos"] });
  const { data: tactics = [] } = useQuery<TacticCollection[]>({ queryKey: ["/api/media/tactics"] });

  const photoUploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      photoFiles.forEach(file => formData.append("images", file));
      return uploadForm("/api/media/photos", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      setPhotoFiles([]);
      setPhotoUploadOpen(false);
      toast({ title: "Fotky boli nahrané" });
    },
    onError: (error: Error) => toast({ title: "Fotky sa nepodarilo nahrať", description: error.message, variant: "destructive" }),
  });

  const tacticUploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("title", tacticTitle);
      formData.append("description", tacticDescription);
      tacticFiles.forEach(file => formData.append("images", file));
      return uploadForm("/api/media/tactics", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      setTacticFiles([]);
      setTacticTitle("");
      setTacticDescription("");
      setTacticUploadOpen(false);
      toast({ title: "Taktika bola vytvorená" });
    },
    onError: (error: Error) => toast({ title: "Taktiku sa nepodarilo vytvoriť", description: error.message, variant: "destructive" }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(`/api/media/photos/${id}`),
    onSuccess: (_result, deletedPhotoId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/photos"] });
      setSelectedPhoto(previous => previous?.id === deletedPhotoId ? null : previous);
      toast({ title: "Fotka bola zmazaná" });
    },
    onError: (error: Error) => toast({ title: "Fotku sa nepodarilo zmazať", description: error.message, variant: "destructive" }),
  });

  const deleteTacticMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(`/api/media/tactics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/tactics"] });
      toast({ title: "Taktika bola zmazaná" });
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-xl font-bold">Súbory</h1>
        <p className="text-sm text-muted-foreground mt-1">Tímové fotky a taktické materiály</p>
      </div>

      <Tabs defaultValue="photos" className="space-y-5">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="photos"><Image className="w-4 h-4 mr-1.5" />Fotky ({photos.length})</TabsTrigger>
          <TabsTrigger value="tactics"><FolderOpen className="w-4 h-4 mr-1.5" />Taktiky ({tactics.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Fotogaléria</h2>
              <p className="text-xs text-muted-foreground">Náhodné fotky zo zápasov a tímu</p>
            </div>
            {isAdmin && <Button size="sm" onClick={() => setPhotoUploadOpen(true)}><Plus className="w-4 h-4 mr-1" />Pridať fotky</Button>}
          </div>

          {photos.length === 0 ? (
            <Card><CardContent className="p-10 text-center"><Images className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Zatiaľ tu nie sú žiadne fotky.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="relative group overflow-hidden rounded-xl border bg-muted aspect-square">
                  <button className="w-full h-full" onClick={() => setSelectedPhoto(photo)} aria-label={`Otvoriť ${photo.originalName}`}>
                    <img src={photo.url} alt={photo.originalName} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  </button>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute right-2 top-2 h-8 px-2 shadow-md"
                      onClick={() => { if (confirm("Zmazať túto fotku?")) deletePhotoMutation.mutate(photo.id); }}
                      aria-label="Zmazať fotku"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />Zmazať
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tactics" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Taktiky</h2>
              <p className="text-xs text-muted-foreground">Každá taktika môže obsahovať viac obrázkov alebo PDF súborov</p>
            </div>
            {isAdmin && <Button size="sm" onClick={() => setTacticUploadOpen(true)}><Plus className="w-4 h-4 mr-1" />Nová taktika</Button>}
          </div>

          {tactics.length === 0 ? (
            <Card><CardContent className="p-10 text-center"><FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Zatiaľ tu nie sú žiadne taktiky.</p></CardContent></Card>
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
                        <p className="text-xs text-muted-foreground mt-1">{tactic.files.length} {tactic.files.length === 1 ? "súbor" : "súborov"} · {format(parseISO(tactic.createdAt), "d. MMM yyyy", { locale: sk })}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Link>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-2 top-2 w-8 h-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={() => { if (confirm("Zmazať celú taktiku aj všetky súbory?")) deleteTacticMutation.mutate(tactic.id); }}
                      aria-label="Zmazať taktiku"
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
          <DialogHeader><DialogTitle>Pridať fotky</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="photo-files">Obrázky</Label>
            <Input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={event => setPhotoFiles(Array.from(event.target.files || []))} />
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP alebo GIF, najviac 10 MB na obrázok a 20 naraz.</p>
            {photoFiles.length > 0 && <p className="text-sm">Vybrané: {photoFiles.length}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoUploadOpen(false)}>Zrušiť</Button>
            <Button onClick={() => photoUploadMutation.mutate()} disabled={photoFiles.length === 0 || photoUploadMutation.isPending}>{photoUploadMutation.isPending ? "Nahrávam..." : "Nahrať"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tacticUploadOpen} onOpenChange={setTacticUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nová taktika</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tactic-title">Názov</Label>
              <Input id="tactic-title" value={tacticTitle} onChange={event => setTacticTitle(event.target.value)} placeholder="Napr. Presing 2–2" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tactic-description">Popis</Label>
              <Textarea id="tactic-description" value={tacticDescription} onChange={event => setTacticDescription(event.target.value)} rows={3} maxLength={1000} placeholder="Krátke vysvetlenie taktiky" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tactic-files">Obrázky alebo PDF v správnom poradí</Label>
              <Input id="tactic-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple onChange={event => setTacticFiles(Array.from(event.target.files || []))} />
              <p className="text-xs text-muted-foreground">Poradie sa zachová. Jeden súbor môže mať najviac 20 MB.</p>
              {tacticFiles.length > 0 && <p className="text-sm">Vybrané: {tacticFiles.length}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTacticUploadOpen(false)}>Zrušiť</Button>
            <Button onClick={() => tacticUploadMutation.mutate()} disabled={!tacticTitle.trim() || tacticFiles.length === 0 || tacticUploadMutation.isPending}>{tacticUploadMutation.isPending ? "Vytváram..." : "Vytvoriť taktiku"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPhoto} onOpenChange={open => { if (!open) setSelectedPhoto(null); }}>
        <DialogContent className="max-w-5xl p-2 sm:p-4">
          <DialogHeader className="sr-only"><DialogTitle>{selectedPhoto?.originalName || "Fotka"}</DialogTitle></DialogHeader>
          {selectedPhoto && <img src={selectedPhoto.url} alt={selectedPhoto.originalName} className="max-h-[85vh] w-full object-contain rounded-lg" />}
          {isAdmin && selectedPhoto && (
            <DialogFooter className="px-2 pb-1">
              <Button
                variant="destructive"
                onClick={() => { if (confirm("Zmazať túto fotku?")) deletePhotoMutation.mutate(selectedPhoto.id); }}
                disabled={deletePhotoMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />{deletePhotoMutation.isPending ? "Mažem..." : "Zmazať fotku"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
