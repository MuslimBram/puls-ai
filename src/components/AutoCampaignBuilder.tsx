import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useDeepAnalytics } from "@/hooks/useDeepAnalytics";
import { ArrowRight, Brain, CalendarRange, Megaphone, Sparkles, Target } from "lucide-react";

export interface AutoCampaignBlueprint {
  id: string;
  name: string;
  objective: string;
  audience: string;
  budgetMin: number;
  budgetMax: number;
  durationDays: number;
  channels: string[];
  reason: string;
  outputs: string[];
  recommended?: boolean;
}

interface AutoCampaignBuilderProps {
  isBuilding: boolean;
  onBuild: (blueprint: AutoCampaignBlueprint) => void | Promise<void>;
  onOpenManual: () => void;
}

export const AutoCampaignBuilder = ({ isBuilding, onBuild, onOpenManual }: AutoCampaignBuilderProps) => {
  const { profile } = useBusinessProfile();
  const metrics = useDeepAnalytics("30d");

  const defaultAudience =
    profile?.target_audience ||
    profile?.industry ||
    "high-intent prospects who match your ideal customer profile";

  const blueprints: AutoCampaignBlueprint[] = [
    {
      id: "lead-sprint",
      name: "Lead Sprint",
      objective: "lead_generation",
      audience: defaultAudience,
      budgetMin: 300,
      budgetMax: 1200,
      durationDays: 14,
      channels: ["facebook", "instagram", "website"],
      reason:
        metrics.totalLeads < 15
          ? "Recent lead volume is still modest, so a short acquisition sprint is the fastest way to create pipeline."
          : "Use a focused sprint to keep discovery momentum high and feed your sales pipeline consistently.",
      outputs: ["Acquisition angle", "2-step funnel", "Draft campaign content"],
      recommended: metrics.totalLeads < 15,
    },
    {
      id: "pipeline-accelerator",
      name: "Pipeline Accelerator",
      objective: "sales",
      audience: defaultAudience,
      budgetMin: 500,
      budgetMax: 1800,
      durationDays: 21,
      channels: ["email", "instagram", "linkedin"],
      reason:
        metrics.hotLeads > 0 || metrics.predictedPipelineValue > 0
          ? `You already have ${metrics.hotLeads} hot leads and $${metrics.predictedPipelineValue.toLocaleString()} in predicted pipeline to convert faster.`
          : "Best when you want a sales-focused funnel with stronger offer positioning and follow-up content.",
      outputs: ["Offer positioning", "Conversion CTA", "Sales-ready nurture content"],
      recommended: metrics.hotLeads > 0 || metrics.predictedPipelineValue > 0,
    },
    {
      id: "reengagement-loop",
      name: "Re-Engagement Loop",
      objective: "brand_awareness",
      audience: defaultAudience,
      budgetMin: 200,
      budgetMax: 900,
      durationDays: 10,
      channels: ["email", "facebook", "website"],
      reason:
        metrics.avgResponseMin > 60 || metrics.churnScore >= 60
          ? "Engagement signals are slowing down, so a re-activation sequence can recover attention before demand softens further."
          : "Use this when you want to warm up older contacts and restart audience attention.",
      outputs: ["Reactivation message", "Reminder content", "Low-friction CTA"],
      recommended: metrics.avgResponseMin > 60 || metrics.churnScore >= 60,
    },
  ];

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Auto Campaign Builder
            </CardTitle>
            <CardDescription>
              Pick a ready-made growth blueprint and generate the campaign strategy automatically in one step.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenManual}>
            Manual Builder
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 xl:grid-cols-3">
        {blueprints.map((blueprint) => (
          <div key={blueprint.id} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
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

            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs capitalize">{blueprint.objective.replace("_", " ")}</Badge>
              <Badge variant="outline" className="text-xs">
                <CalendarRange className="mr-1 h-3 w-3" />
                {blueprint.durationDays} days
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Target className="mr-1 h-3 w-3" />
                ${blueprint.budgetMin}–${blueprint.budgetMax}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Channels</p>
                <div className="flex flex-wrap gap-1.5">
                  {blueprint.channels.map((channel) => (
                    <Badge key={channel} variant="secondary" className="text-xs capitalize">
                      {channel}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <Brain className="h-3 w-3" />
                  Auto outputs
                </p>
                <div className="space-y-1.5">
                  {blueprint.outputs.map((output) => (
                    <div key={output} className="rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                      {output}
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full" onClick={() => onBuild(blueprint)} disabled={isBuilding}>
                <Sparkles className="h-4 w-4" />
                {isBuilding ? "Building..." : "Build Campaign"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
