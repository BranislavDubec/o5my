import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

interface TacticWithFiles {
  id: number;
  title: string;
  files: Array<{
    id: number;
    originalName: string;
    mimeType: string;
    url: string;
  }>;
}

function AppPdfViewer({ url, title }: { url: string; title: string }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]> | null = null;

    setIsLoading(true);
    setError(null);
    setDocument(null);
    setPageNumber(1);

    void import("pdfjs-dist/legacy/build/pdf.mjs")
      .then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ url, withCredentials: true });
        return loadingTask.promise;
      })
      .then(pdf => {
        if (cancelled) return;
        setDocument(pdf);
        setIsLoading(false);
      })
      .catch(loadError => {
        if (cancelled) return;
        console.error("PDF loading failed", loadError);
        setError(t("tacticPdf.loadFailed"));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || containerWidth === 0) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    void document.getPage(pageNumber).then(page => {
      if (cancelled) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = Math.max(0.25, (containerWidth - 16) / baseViewport.width);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * outputScale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`;
      canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`;

      renderTask = page.render({ canvas, viewport });
      return renderTask.promise;
    }).catch(renderError => {
      if (cancelled || (renderError instanceof Error && renderError.name === "RenderingCancelledException")) return;
      console.error("PDF page rendering failed", renderError);
      setError(t("tacticPdf.renderFailed"));
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, document, pageNumber]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!document || pageNumber <= 1}
          onClick={() => setPageNumber(current => Math.max(1, current - 1))}
          aria-label={t("tacticPdf.prevPage")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          {document ? t("tacticPdf.pageXOfY", { page: pageNumber, total: document.numPages }) : t("tacticPdf.loading")}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!document || pageNumber >= document.numPages}
          onClick={() => setPageNumber(current => document ? Math.min(document.numPages, current + 1) : current)}
          aria-label={t("tacticPdf.nextPage")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <CardContent ref={containerRef} className="min-h-[55vh] overflow-auto bg-muted p-2">
        {isLoading && <p className="p-8 text-center text-sm text-muted-foreground">{t("tacticPdf.loading")}</p>}
        {error && <p className="p-8 text-center text-sm text-destructive">{error}</p>}
        <canvas
          ref={canvasRef}
          title={title}
          className={`mx-auto bg-white shadow-sm ${document && !error ? "block" : "hidden"}`}
        />
      </CardContent>
    </Card>
  );
}

export default function TacticPdfPage() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>();
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const { data: tactic, isLoading, error } = useQuery<TacticWithFiles>({
    queryKey: ["/api/media/tactics", id],
  });
  const file = tactic?.files.find(candidate => candidate.id === Number(fileId));
  const tacticUrl = `/files/tactics/${id}`;

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">{t("tacticPdf.loading")}</p>;
  }

  if (error || !tactic || !file || file.mimeType !== "application/pdf") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(tacticUrl, { replace: true })}>
          <ArrowLeft className="w-4 h-4 mr-1" />{t("tacticPdf.backToTactic")}
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">{t("tacticPdf.loadFailed")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(tacticUrl, { replace: true })}>
          <ArrowLeft className="w-4 h-4 mr-1" />{t("tacticPdf.backToTactic")}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={file.url} download={file.originalName}>
            <Download className="w-4 h-4 mr-1" />{t("tacticPdf.download")}
          </a>
        </Button>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{file.originalName}</p>
          <p className="text-xs text-muted-foreground truncate">{tactic.title}</p>
        </div>
      </div>

      <AppPdfViewer url={file.url} title={`${tactic.title} – ${file.originalName}`} />
    </div>
  );
}
