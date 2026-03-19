import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useChannels } from "@/hooks/useChannels";
import { useLeads } from "@/hooks/useLeads";
import { useInbox } from "@/hooks/useInbox";
import { useAutomationWorkflows } from "@/hooks/useAutomations";
import { Rocket, Check, Circle } from "lucide-react";
import { Link } from "react-router-dom";

interface Milestone {
  label: string;
  done: boolean;
  href: string;
  suggestion: string;
}

export const GrowthProgressIndicator = () => {
  const { channels } = useChannels();
  const { leads } = useLeads();
  const { messages } = useInbox();
  const { automations } = useAutomations();

  const milestones: Milestone[] = [
    {
      label: "Connect first channel",
      done: (channels ?? []).length > 0,
      href: "/connections",
      suggestion: "Connect a messaging channel to start receiving leads",
    },
    {
      label: "Capture 10+ leads",
      done: (leads ?? []).length >= 10,
      href: "/leads",
      suggestion: "Add keywords or connect more channels to capture leads",
    },
    {
      label: "Reply to 5+ messages",
      done: (messages ?? []).filter((m) => !m.is_unread).length >= 5,
      href: "/inbox",
      suggestion: "Respond to inbox messages to build engagement",
    },
    {
      label: "Create an automation",
      done: (automations ?? []).length > 0,
      href: "/automations",
      suggestion: "Set up auto-replies or lead routing workflows",
    },
    {
      label: "Connect 3+ channels",
      done: (channels ?? []).length >= 3,
      href: "/connections",
      suggestion: "Add more channels for multi-channel engagement",
    },
  ];

  const completed = milestones.filter((m) => m.done).length;
  const percentage = Math.round((completed / milestones.length) * 100);
  const nextMilestone = milestones.find((m) => !m.done);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            Growth Progress
          </CardTitle>
          <Badge variant="secondary">{completed}/{milestones.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={percentage} className="h-2" />

        <div className="space-y-2">
          {milestones.map((m) => (
            <Link
              key={m.label}
              to={m.href}
              className="flex items-center gap-2 rounded-lg p-1.5 text-xs transition-colors hover:bg-muted/50"
            >
              {m.done ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span className={m.done ? "text-muted-foreground line-through" : "text-foreground"}>
                {m.label}
              </span>
            </Link>
          ))}
        </div>

        {nextMilestone && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground">
            💡 {nextMilestone.suggestion}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
