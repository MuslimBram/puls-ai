import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Building2, Key, Radio, Zap } from "lucide-react";

interface ChecklistProps {
  hasProfile: boolean;
  hasKeywords: boolean;
  hasTelegram: boolean;
  hasLeads: boolean;
}

const steps = [
  { key: "hasProfile", label: "Complete business profile", icon: Building2, href: "/business-profile", action: "Set up" },
  { key: "hasKeywords", label: "Add monitoring keywords", icon: Key, href: "/keywords", action: "Add keywords" },
  { key: "hasTelegram", label: "Connect Telegram channel", icon: Radio, href: "/channels", action: "Connect" },
  { key: "hasLeads", label: "Lead monitoring active", icon: Zap, href: "/leads", action: "View leads" },
] as const;

export const SetupChecklist = (props: ChecklistProps) => {
  const completed = steps.filter((s) => props[s.key]).length;
  const total = steps.length;
  const allDone = completed === total;

  if (allDone) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-5 w-5 text-primary" />
          Quick Start — {completed}/{total} complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step) => {
          const done = props[step.key];
          return (
            <div key={step.key} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className={`text-sm flex-1 ${done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                {step.label}
              </span>
              {!done && (
                <Link to={step.href}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    {step.action}
                  </Button>
                </Link>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
