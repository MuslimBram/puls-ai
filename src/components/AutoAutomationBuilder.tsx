import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useDeepAnalytics } from "@/hooks/useDeepAnalytics";
import { Bot, Clock3, Sparkles, Target, Workflow, ArrowRight, ShieldAlert } from "lucide-react";
import type { AutomationAction } from "@/hooks/useAutomations";

export interface AutomationBlueprint {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  reason: string;
  actions: AutomationAction[];
  tags: string[];
  recommended?: boolean;
}

interface AutoAutomationBuilderProps {
  isBuilding: boolean;
  onBuild: (blueprint: AutomationBlueprint) => void | Promise<void>;
  onOpenTemplates: () => void;
}

export const AutoAutomationBuilder = ({ isBuilding, onBuild, onOpenTemplates }: AutoAutomationBuilderProps) => {
  const { profile } = useBusinessProfile();
  const metrics = useDeepAnalytics("30d");

  const brandName = profile?.business_name || "your business";
  const serviceLabel = profile?.main_services || "your offer";

  const blueprints: AutomationBlueprint[] = [
    {
      id: "lead-intake-autopilot",
      name: "Lead Intake Autopilot",
      description: "Welcome every new lead, assign ownership, and tag it for follow-up instantly.",
      triggerType: "new_lead",
      reason:
        metrics.totalLeads < 20
          ? "Lead volume is still building, so instant qualification and assignment will reduce leaks early."
          : "Use this to keep new lead response consistent as volume grows.",
      recommended: metrics.totalLeads < 20,
      tags: ["Lead routing", "Instant response"],
      actions: [
        {
          id: "welcome-message",
          type: "send_message",
          delay_minutes: 0,
          config: {
            message: `Hi {{name}}, thanks for contacting ${brandName}. We’ve received your request about ${serviceLabel} and will follow up shortly.`,
          },
        },
        {
          id: "assign-owner",
          type: "assign_owner",
          delay_minutes: 0,
          config: { strategy: "round_robin" },
        },
        {
          id: "tag-lead",
          type: "update_tags",
          delay_minutes: 0,
          config: { tags: ["new-lead", "auto-routed"] },
        },
      ],
    },
    {
      id: "response-recovery-loop",
      name: "Response Recovery Loop",
      description: "Recover slow inbox conversations with a follow-up and internal alert.",
      triggerType: "inactivity",
      reason:
        metrics.avgResponseMin > 60
          ? `Average response time is ${metrics.avgResponseMin} minutes, so this flow helps recover delayed conversations.`
          : "Useful when you want a safety net for conversations that stall before a human replies.",
      recommended: metrics.avgResponseMin > 60,
      tags: ["Inbox ops", "SLA protection"],
      actions: [
        {
          id: "follow-up-message",
          type: "send_message",
          delay_minutes: 180,
          config: {
            message: `Hi {{name}}, just checking back in from ${brandName}. If you still need help with ${serviceLabel}, reply here and we’ll jump in.`,
          },
        },
        {
          id: "internal-alert",
          type: "notify_internal",
          delay_minutes: 0,
          config: {
            message: "A contact has been waiting too long for a reply — review this conversation now.",
          },
        },
        {
          id: "create-task",
          type: "create_task",
          delay_minutes: 0,
          config: {
            title: "Review delayed conversation",
          },
        },
      ],
    },
    {
      id: "retention-watchtower",
      name: "Retention Watchtower",
      description: "Detect inactivity risk and launch a re-engagement sequence before demand drops further.",
      triggerType: "inactivity",
      reason:
        metrics.churnScore >= 60
          ? `Churn risk is elevated at ${metrics.churnScore}, so a recovery workflow should be active now.`
          : "Best for reactivating quiet contacts and protecting repeat demand.",
      recommended: metrics.churnScore >= 60,
      tags: ["Retention", "Re-engagement"],
      actions: [
        {
          id: "reactivation-message",
          type: "send_message",
          delay_minutes: 1440,
          config: {
            message: `Hi {{name}}, it’s been a while since we connected with ${brandName}. If you want help with ${serviceLabel}, reply and we’ll prepare the next step for you.`,
          },
        },
        {
          id: "email-alert",
          type: "notify_email",
          delay_minutes: 0,
          config: {
            subject: "Retention risk workflow triggered",
          },
        },
        {
          id: "retention-tag",
          type: "update_tags",
          delay_minutes: 0,
          config: { tags: ["retention-risk", "reengagement-sent"] },
        },
      ],
    },
  ];

  const iconMap = {
    "lead-intake-autopilot": Target,
    "response-recovery-loop": Clock3,
    "retention-watchtower": ShieldAlert,
  } as const;

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-secondary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4 text-primary" />
              Auto Automation Builder
            </CardTitle>
            <CardDescription>
              Install a ready-to-run workflow based on your current growth, response, and retention signals.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenTemplates}>
            Templates Library
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 xl:grid-cols-3">
        {blueprints.map((blueprint) => {
          const Icon = iconMap[blueprint.id] || Bot;

          return (
            <div key={blueprint.id} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">{blueprint.name}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{blueprint.reason}</p>
                </div>
                {blueprint.recommended && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                    Recommended
                  </Badge>
                )}
              </div>

              <p className="mb-3 text-sm text-muted-foreground">{blueprint.description}</p>

              <div className="mb-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs capitalize">
                  {blueprint.triggerType.replaceAll("_", " ")}
                </Badge>
                {blueprint.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="mb-4 space-y-1.5">
                {blueprint.actions.map((action, index) => (
                  <div key={action.id} className="rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                    {index + 1}. {action.type.replaceAll("_", " ")}
                  </div>
                ))}
              </div>

              <Button className="w-full" disabled={isBuilding} onClick={() => onBuild(blueprint)}>
                <Sparkles className="h-4 w-4" />
                {isBuilding ? "Building..." : "Build Workflow"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
