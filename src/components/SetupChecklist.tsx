import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, Building2, Key, Radio, Zap, Brain,
  MessageSquare, Globe, Shield, Sparkles, ChevronDown, ChevronUp,
  PartyPopper, X,
} from "lucide-react";

interface ChecklistProps {
  hasProfile: boolean;
  hasKeywords: boolean;
  hasTelegram: boolean;
  hasLeads: boolean;
  hasKnowledge?: boolean;
  hasAutomation?: boolean;
  hasChannel?: boolean;
  hasInbox?: boolean;
}

const steps = [
  { key: "hasProfile", label: "Set up your business profile", desc: "Tell the AI about your business", icon: Building2, href: "/business-profile", action: "Set up", priority: 1 },
  { key: "hasKeywords", label: "Add monitoring keywords", desc: "Track what matters to your business", icon: Key, href: "/keywords", action: "Add keywords", priority: 2 },
  { key: "hasChannel", label: "Connect a messaging channel", desc: "WhatsApp, Telegram, Email, or Website Chat", icon: Radio, href: "/channels", action: "Connect", priority: 3 },
  { key: "hasTelegram", label: "Activate Telegram monitoring", desc: "Real-time lead capture from Telegram groups", icon: MessageSquare, href: "/channels", action: "Activate", priority: 4 },
  { key: "hasKnowledge", label: "Train the AI with your content", desc: "Add website or documents to knowledge base", icon: Brain, href: "/knowledge-base", action: "Train AI", priority: 5 },
  { key: "hasAutomation", label: "Create your first automation", desc: "Auto-respond or route messages", icon: Zap, href: "/automations", action: "Create", priority: 6 },
  { key: "hasLeads", label: "Capture your first lead", desc: "Leads appear automatically once channels are active", icon: Sparkles, href: "/leads", action: "View leads", priority: 7 },
  { key: "hasInbox", label: "Reply from unified inbox", desc: "All conversations in one place", icon: Globe, href: "/inbox", action: "Open inbox", priority: 8 },
] as const;

const DISMISS_KEY = "setup-checklist-dismissed";

export const SetupChecklist = (props: ChecklistProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "true");

  const completed = steps.filter((s) => props[s.key as keyof ChecklistProps]).length;
  const total = steps.length;
  const pct = Math.round((completed / total) * 100);
  const allDone = completed === total;

  if (dismissed) return null;

  // Celebration state
  if (allDone) {
    return (
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="py-6 text-center relative">
          <Button
            size="sm" variant="ghost"
            className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground"
            onClick={() => { localStorage.setItem(DISMISS_KEY, "true"); setDismissed(true); }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <PartyPopper className="h-10 w-10 text-primary mx-auto mb-2" />
          <h3 className="text-lg font-bold text-foreground mb-1">Setup Complete!</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Your account is fully configured. You're ready to capture and convert leads.
          </p>
          <div className="flex gap-2 justify-center">
            <Link to="/analytics">
              <Button size="sm" variant="outline">View Analytics</Button>
            </Link>
            <Button
              size="sm" variant="ghost"
              onClick={() => { localStorage.setItem(DISMISS_KEY, "true"); setDismissed(true); }}
            >
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort: incomplete first, then by priority
  const sortedSteps = [...steps].sort((a, b) => {
    const aDone = props[a.key as keyof ChecklistProps] ? 1 : 0;
    const bDone = props[b.key as keyof ChecklistProps] ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.priority - b.priority;
  });

  const visibleSteps = collapsed ? sortedSteps.slice(0, 3) : sortedSteps;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Getting Started
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{completed}/{total}</Badge>
            <Button
              size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => { localStorage.setItem(DISMISS_KEY, "true"); setDismissed(true); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
        <p className="text-xs text-muted-foreground mt-1">{pct}% complete — {total - completed} steps remaining</p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visibleSteps.map((step) => {
          const done = props[step.key as keyof ChecklistProps];
          return (
            <div key={step.key} className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${done ? "opacity-60" : "hover:bg-primary/5"}`}>
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <step.icon className={`h-4 w-4 shrink-0 ${done ? "text-muted-foreground" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                  {step.label}
                </span>
                {!done && (
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                )}
              </div>
              {!done && (
                <Link to={step.href}>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0">
                    {step.action}
                  </Button>
                </Link>
              )}
            </div>
          );
        })}

        {total > 3 && (
          <Button
            variant="ghost" size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <><ChevronDown className="h-3 w-3 mr-1" /> Show all {total} steps</>
            ) : (
              <><ChevronUp className="h-3 w-3 mr-1" /> Show less</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
