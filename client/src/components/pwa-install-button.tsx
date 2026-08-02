import { useState } from "react";
import { CheckCircle2, Download, MoreVertical, Share2, Smartphone } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePwaInstall } from "@/contexts/pwa-install-context";
import { cn } from "@/lib/utils";

interface PwaInstallButtonProps extends ButtonProps {
  showInstalledState?: boolean;
}

export function PwaInstallButton({ className, showInstalledState = false, ...buttonProps }: PwaInstallButtonProps) {
  const { canPromptInstall, isInstalled, platform, promptInstall } = usePwaInstall();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  if (isInstalled) {
    if (!showInstalledState) return null;
    return (
      <Button {...buttonProps} variant="outline" disabled className={cn("justify-center", className)}>
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Aplikácia je nainštalovaná
      </Button>
    );
  }

  const handleInstall = async () => {
    if (canPromptInstall) {
      await promptInstall();
      return;
    }
    setInstructionsOpen(true);
  };

  const buttonLabel = platform === "ios"
    ? "Pridať na plochu"
    : canPromptInstall
      ? "Nainštalovať aplikáciu"
      : "Ako nainštalovať aplikáciu";

  return (
    <>
      <Button
        {...buttonProps}
        type="button"
        variant="outline"
        className={cn("justify-center", className)}
        onClick={handleInstall}
        data-testid="button-install-pwa"
      >
        <Download className="w-4 h-4 mr-2" />
        {buttonLabel}
      </Button>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Nainštalovať O5MY Futsal
            </DialogTitle>
            <DialogDescription>
              Aplikácia sa pridá na plochu a bude sa otvárať bez panela prehliadača.
            </DialogDescription>
          </DialogHeader>

          {platform === "ios" ? (
            <ol className="space-y-3 text-sm list-decimal pl-5">
              <li>Otvor túto stránku v Safari.</li>
              <li>Ťukni na <Share2 className="w-4 h-4 inline mx-1" /> <strong>Zdieľať</strong>.</li>
              <li>Vyber <strong>Pridať na plochu</strong>.</li>
              <li>Zapni <strong>Otvoriť ako webovú aplikáciu</strong> a potvrď pridanie.</li>
            </ol>
          ) : platform === "android" ? (
            <ol className="space-y-3 text-sm list-decimal pl-5">
              <li>Otvor túto stránku v Chrome.</li>
              <li>Ťukni na menu <MoreVertical className="w-4 h-4 inline mx-1" />.</li>
              <li>Vyber <strong>Pridať na plochu</strong> alebo <strong>Nainštalovať aplikáciu</strong>.</li>
              <li>Potvrď inštaláciu.</li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm list-decimal pl-5">
              <li>Otvor menu svojho prehliadača.</li>
              <li>Vyber <strong>Nainštalovať aplikáciu</strong> alebo <strong>Pridať na plochu</strong>.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
