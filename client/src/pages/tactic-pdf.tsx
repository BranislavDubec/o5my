import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

export default function TacticPdfPage() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>();
  const { data: tactic, isLoading, error } = useQuery<TacticWithFiles>({
    queryKey: ["/api/media/tactics", id],
  });
  const file = tactic?.files.find(candidate => candidate.id === Number(fileId));
  const tacticUrl = `/files/tactics/${id}`;

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">Načítavam PDF...</p>;
  }

  if (error || !tactic || !file || file.mimeType !== "application/pdf") {
    return (
      <div className="space-y-4">
        <Link href={tacticUrl}>
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Späť na taktiku</Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">PDF sa nepodarilo načítať.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <Link href={tacticUrl}>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />Späť na taktiku
          </Button>
        </Link>
        <Button variant="outline" size="sm" asChild>
          <a href={file.url} target="_blank" rel="noreferrer">
            <ExternalLink className="w-4 h-4 mr-1" />Mimo aplikácie
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

      <Card className="overflow-hidden">
        <CardContent className="p-0 h-[calc(100dvh-13rem)] min-h-[480px] bg-muted">
          <iframe src={file.url} title={`${tactic.title} – ${file.originalName}`} className="w-full h-full border-0" />
        </CardContent>
      </Card>
    </div>
  );
}
