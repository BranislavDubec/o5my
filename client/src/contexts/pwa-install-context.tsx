import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallPlatform = "ios" | "android" | "other";
type InstallOutcome = "accepted" | "dismissed" | "unavailable";

interface PwaInstallContextValue {
  canPromptInstall: boolean;
  isInstalled: boolean;
  platform: InstallPlatform;
  promptInstall: () => Promise<InstallOutcome>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectPlatform(): InstallPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(userAgent) || isIpad) return "ios";
  if (/android/.test(userAgent)) return "android";
  return "other";
}

function detectStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectStandaloneMode);
  const platform = useMemo(detectPlatform, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsInstalled(detectStandaloneMode());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    displayMode.addEventListener("change", handleDisplayModeChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      displayMode.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredPrompt) return "unavailable";

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setIsInstalled(true);
    return choice.outcome;
  }, [deferredPrompt]);

  return (
    <PwaInstallContext.Provider value={{
      canPromptInstall: Boolean(deferredPrompt),
      isInstalled,
      platform,
      promptInstall,
    }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error("usePwaInstall must be used inside PwaInstallProvider");
  return context;
}
