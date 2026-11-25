import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Rocket, ArrowRight, Clock, X, PartyPopper, Sparkles } from "lucide-react";
import { useActivation } from "@/hooks/useActivation";

export const ActivationChecklist = () => {
  const { steps, completed, total, percent, nextStep, isComplete, isDismissed, dismiss, reopen, isLoading } = useActivation();

  if (isLoading) return null;

  if (isDismissed) {
    return (
      <button
        onClick={() => reopen.mutate()}
        className="w-full flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition"
      >
        <span className="flex items-center gap-2"><Rocket className="h-3.5 w-3.5" /> Activation: {completed}/{total} steps</span>
        <span className="text-primary">Show checklist →</span>
      </button>
    );
  }

  if (isComplete) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/5 sticky top-0 z-10">
        <CardContent className="py-5 flex items-center gap-4">
          <div className="rounded-full bg-primary/15 p-3"><PartyPopper className="h-6 w-6 text-primary" /></div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground">You're fully activated! 🎉</h3>
            <p className="text-xs text-muted-foreground">Your workspace is set up. Time to scale — explore Analytics and Automations.</p>
          </div>
          <Link to="/analytics"><Button size="sm" variant="outline">View analytics</Button></Link>
          <Button aria-label="Close" size="icon" variant="ghost" className="h-7 w-7" onClick={() => dismiss.mutate()}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5 shadow-sm">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/15 p-2.5"><Rocket className="h-5 w-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-base text-foreground">Get to your first lead in 10 minutes</h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{completed}/{total}</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dismiss.mutate()} title="Hide for now">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Progress value={percent} className="h-2 flex-1" />
              <span className="text-xs font-medium text-muted-foreground tabular-nums">{percent}%</span>
            </div>
          </div>
        </div>

        {/* Next step CTA */}
        {nextStep && (
          <Link
            to={nextStep.href}
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 hover:bg-primary/15 transition group"
          >
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-primary font-semibold">Next up</p>
              <p className="text-sm font-medium text-foreground truncate">{nextStep.label}</p>
              <p className="text-xs text-muted-foreground truncate">{nextStep.description}</p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
              <Clock className="h-3 w-3" /> {nextStep.estMinutes} min
            </Badge>
            <Button size="sm" className="shrink-0 gap-1">
              {nextStep.cta} <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
        )}

        {/* All steps */}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                to={s.href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                  s.completed
                    ? "text-muted-foreground line-through opacity-70"
                    : "text-foreground hover:bg-muted/40"
                }`}
              >
                {s.completed
                  ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                <span className="flex-1 truncate">{s.label}</span>
                {!s.completed && (
                  <span className="text-[10px] text-muted-foreground">{s.estMinutes}m</span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-muted-foreground text-center">
          💡 Workspaces that finish setup are 4× more likely to capture their first lead this week.
        </p>
      </CardContent>
    </Card>
  );
};
