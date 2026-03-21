import { useEffect, useState } from "react";
import { Download, Smartphone, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

const INSTALL_DISMISSED_KEY = "pwa-install-dismissed";

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    setDismissed(window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true");

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!window.localStorage.getItem(INSTALL_DISMISSED_KEY)) {
        setDeferredPrompt(event as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.localStorage.removeItem(INSTALL_DISMISSED_KEY);
    };

    const handleConnectionChange = () => setIsOnline(window.navigator.onLine);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
    };
  }, []);

  const canInstall = Boolean(deferredPrompt) && !isInstalled && !dismissed;

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      window.localStorage.removeItem(INSTALL_DISMISSED_KEY);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setDismissed(true);
    setDeferredPrompt(null);
  };

  return (
    <>
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-[60] rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur">
          <span className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 text-primary" />
            Offline mode active
          </span>
        </div>
      )}

      {canInstall && (
        <div className="fixed inset-x-4 bottom-4 z-[60] sm:left-auto sm:right-4 sm:w-[380px]">
          <Card className="border-border bg-card/95 shadow-2xl backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Install Pulse AI</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add the app to your device for full-screen access, offline support, and instant loading.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleInstall}>
                      <Download className="mr-2 h-4 w-4" />
                      Install app
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDismiss}>
                      Not now
                    </Button>
                  </div>
                </div>

                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDismiss}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
