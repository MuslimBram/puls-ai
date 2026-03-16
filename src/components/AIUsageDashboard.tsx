import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useSubscription } from "@/hooks/useSubscription";
import { Bot, Zap, TrendingUp, DollarSign } from "lucide-react";

const COST_PER_AI_REPLY = 0.003; // estimated cost per AI call

export const AIUsageDashboard = () => {
  const { plan, checkLimit } = useFeatureGating();
  const { subscription } = useSubscription();

  const aiToday = subscription?.ai_replies_today ?? 0;
  const aiLimit = checkLimit("aiRepliesPerDay", aiToday);
  const aiPercent = aiLimit.limit === -1 ? 0 : Math.min(Math.round((aiToday / aiLimit.limit) * 100), 100);

  const leadsUsed = subscription?.leads_used ?? 0;
  const estimatedMonthlyCost = (leadsUsed * 0.5 + aiToday * 30) * COST_PER_AI_REPLY;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{aiToday}</p>
            <p className="text-xs text-muted-foreground">AI Replies Today</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{leadsUsed}</p>
            <p className="text-xs text-muted-foreground">Leads Analyzed</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <DollarSign className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">${estimatedMonthlyCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Est. Monthly AI Cost</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Daily AI Reply Quota</span>
            <span className="font-medium text-foreground">
              {aiLimit.limit === -1 ? `${aiToday} / ∞` : `${aiToday} / ${aiLimit.limit}`}
            </span>
          </div>
          {aiLimit.limit !== -1 && (
            <Progress
              value={aiPercent}
              className={`h-2 ${aiPercent >= 100 ? "[&>[role=progressbar]]:bg-destructive" : aiPercent >= 80 ? "[&>[role=progressbar]]:bg-warning" : ""}`}
            />
          )}
          {aiPercent >= 100 && (
            <Badge variant="destructive" className="text-xs">Daily limit reached</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
