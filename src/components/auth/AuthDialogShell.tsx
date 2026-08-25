import { useState, type ReactNode } from "react";
import { ArrowLeft, Home, Maximize2, Minus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuthBackdropVisual } from "./AuthBackdropVisual";

export function AuthDialogShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);

  return (
    <>
      <AuthBackdropVisual />
      {minimized ? (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-xl"
          aria-label="Restore dialog"
        >
          <Maximize2 className="h-4 w-4 text-primary" />
          Pulse AI
        </button>
      ) : (
        <div className="relative z-10 flex w-full justify-center">
          <div className="fixed right-3 top-3 z-[70] flex items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1 shadow-lg backdrop-blur sm:right-5 sm:top-5">
            <button type="button" onClick={() => navigate(-1)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setMinimized(true)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Minimize dialog">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => navigate("/")} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Home">
              <Home className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => navigate("/")} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close dialog">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </>
  );
}
