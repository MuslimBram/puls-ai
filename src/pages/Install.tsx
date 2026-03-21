import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Monitor, Smartphone, Tablet, Download, CheckCircle2, 
  ArrowRight, Zap, Shield, Globe 
} from "lucide-react";

const InstallPage = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform("ios");
    else if (/android/.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  const features = [
    { icon: Zap, title: "Shpejtësi Maksimale", desc: "Ngarkohet menjëherë, punon offline." },
    { icon: Shield, title: "Siguri e Lartë", desc: "Të dhënat tuaja janë të mbrojtura." },
    { icon: Globe, title: "Çdo Pajisje", desc: "Kompjuter, laptop, tablet, telefon." },
  ];

  return (
    <div className="min-h-screen bg-[hsl(222,47%,5%)] text-[hsl(220,20%,93%)] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,25%,12%)]">
        <div className="flex items-center gap-3">
          <img src="/pwa/icon-64.png" alt="Pulse AI" className="h-8 w-8 rounded-lg" />
          <div>
            <span className="font-semibold text-sm tracking-tight">Pulse AI</span>
            <span className="text-[10px] text-[hsl(220,15%,50%)] ml-1.5">v1.0</span>
          </div>
        </div>
        <a href="/login">
          <Button variant="outline" size="sm" className="border-[hsl(222,25%,16%)] bg-transparent text-[hsl(220,20%,80%)] hover:bg-[hsl(222,30%,10%)] h-8 text-xs">
            Hyr
          </Button>
        </a>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="animate-pulse-glow rounded-2xl p-1 mb-8">
          <img src="/pwa/icon-512.png" alt="Pulse AI" className="h-24 w-24 rounded-2xl" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 leading-tight">
          Pulse AI
          <span className="text-[hsl(145,73%,49%)] ml-2">v1.0</span>
        </h1>

        <p className="text-[hsl(220,15%,55%)] text-sm sm:text-base max-w-md mb-10 leading-relaxed">
          Platforma inteligjente e biznesit. Instaloni në çdo pajisje dhe filloni menjëherë.
        </p>

        {/* Device icons */}
        <div className="flex items-center gap-6 mb-10">
          {[
            { icon: Monitor, label: "Desktop", active: platform === "desktop" },
            { icon: Tablet, label: "Tablet", active: false },
            { icon: Smartphone, label: "Mobile", active: platform !== "desktop" },
          ].map(({ icon: Icon, label, active }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div className={`p-3 rounded-xl transition-colors ${
                active 
                  ? "bg-[hsl(145,73%,49%)]/10 text-[hsl(145,73%,49%)]" 
                  : "bg-[hsl(222,30%,10%)] text-[hsl(220,15%,45%)]"
              }`}>
                <Icon className="h-6 w-6" />
              </div>
              <span className="text-[10px] text-[hsl(220,15%,45%)]">{label}</span>
            </div>
          ))}
        </div>

        {/* Install CTA */}
        {installed ? (
          <div className="flex items-center gap-2 text-[hsl(145,73%,49%)] mb-8">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Pulse AI është instaluar!</span>
          </div>
        ) : deferredPrompt ? (
          <Button 
            onClick={handleInstall}
            className="bg-[hsl(145,73%,49%)] text-[hsl(222,47%,5%)] hover:bg-[hsl(145,73%,42%)] h-12 px-8 text-sm font-semibold gap-2 rounded-xl mb-8 active:scale-[0.97] transition-transform"
          >
            <Download className="h-4 w-4" />
            Instalo Pulse AI
          </Button>
        ) : (
          <div className="mb-8 max-w-sm">
            {platform === "ios" ? (
              <div className="rounded-xl border border-[hsl(222,25%,16%)] bg-[hsl(222,40%,8%)] p-4 text-left">
                <p className="text-xs font-medium text-[hsl(220,20%,80%)] mb-2">Instalo në iPhone / iPad:</p>
                <ol className="text-xs text-[hsl(220,15%,50%)] space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">1.</span> Shtyp butonin Share ↗</li>
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">2.</span> Zgjidhni "Add to Home Screen"</li>
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">3.</span> Konfirmoni me "Add"</li>
                </ol>
              </div>
            ) : platform === "android" ? (
              <div className="rounded-xl border border-[hsl(222,25%,16%)] bg-[hsl(222,40%,8%)] p-4 text-left">
                <p className="text-xs font-medium text-[hsl(220,20%,80%)] mb-2">Instalo në Android:</p>
                <ol className="text-xs text-[hsl(220,15%,50%)] space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">1.</span> Shtyp menynë ⋮ të browser-it</li>
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">2.</span> Zgjidhni "Install app" ose "Add to Home Screen"</li>
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">3.</span> Konfirmoni instalimin</li>
                </ol>
              </div>
            ) : (
              <div className="rounded-xl border border-[hsl(222,25%,16%)] bg-[hsl(222,40%,8%)] p-4 text-left">
                <p className="text-xs font-medium text-[hsl(220,20%,80%)] mb-2">Instalo në Desktop:</p>
                <ol className="text-xs text-[hsl(220,15%,50%)] space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">1.</span> Klikoni ikonën e instalimit në adress bar</li>
                  <li className="flex items-start gap-2"><span className="text-[hsl(145,73%,49%)] font-bold">2.</span> Ose përdorni menynë: "Install Pulse AI"</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg sm:max-w-2xl w-full">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-[hsl(222,25%,12%)] bg-[hsl(222,40%,7%)] p-4 text-left">
              <Icon className="h-4 w-4 text-[hsl(145,73%,49%)] mb-2" />
              <p className="text-xs font-medium text-[hsl(220,20%,85%)] mb-0.5">{title}</p>
              <p className="text-[11px] text-[hsl(220,15%,45%)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <a href="/register" className="mt-10">
          <Button variant="ghost" className="text-[hsl(220,15%,50%)] hover:text-[hsl(145,73%,49%)] text-xs gap-1.5">
            Krijo llogari falas
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </a>
      </main>

      {/* Footer */}
      <footer className="border-t border-[hsl(222,25%,10%)] px-6 py-4 text-center">
        <p className="text-[10px] text-[hsl(220,15%,35%)]">
          © 2026 Pulse AI — Të gjitha të drejtat e rezervuara.
        </p>
      </footer>
    </div>
  );
};

export default InstallPage;
