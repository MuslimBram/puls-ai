import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Lightbulb } from "lucide-react";

export interface TourStep {
  selector: string; // CSS selector
  title: string;
  body: string;
}

interface Props {
  tourId: string; // unique key, e.g. "inbox-v1"
  steps: TourStep[];
  enabled?: boolean;
}

/**
 * Lightweight gradual coach-mark tour.
 * - Persists dismissal in localStorage (tour:${tourId})
 * - Highlights one element at a time, no blocking overlay
 */
export const CoachTour = ({ tourId, steps, enabled = true }: Props) => {
  const [idx, setIdx] = useState(0);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const seen = localStorage.getItem(`tour:${tourId}`);
    if (seen) return;
    setActive(true);
  }, [tourId, enabled]);

  useEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      // skip missing
      if (idx + 1 < steps.length) setIdx(idx + 1);
      else finish();
      return;
    }
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx, active, steps]);

  const finish = () => {
    localStorage.setItem(`tour:${tourId}`, new Date().toISOString());
    setActive(false);
  };

  if (!active || !pos) return null;
  const step = steps[idx];

  return (
    <>
      {/* Highlight ring */}
      <div
        className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
        style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
      />
      {/* Tooltip */}
      <Card
        ref={ref}
        className="fixed z-[61] w-80 p-4 shadow-xl border-primary/30"
        style={{
          top: Math.min(pos.top + pos.height + 12, window.scrollY + window.innerHeight - 160),
          left: Math.max(16, Math.min(pos.left, window.innerWidth - 336)),
        }}
      >
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">{step.title}</div>
            <p className="text-sm text-muted-foreground mt-1">{step.body}</p>
          </div>
          <button onClick={finish} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">{idx + 1} / {steps.length}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={finish}>Skip</Button>
            {idx + 1 < steps.length ? (
              <Button size="sm" onClick={() => setIdx(idx + 1)}>Next</Button>
            ) : (
              <Button size="sm" onClick={finish}>Got it</Button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
};
