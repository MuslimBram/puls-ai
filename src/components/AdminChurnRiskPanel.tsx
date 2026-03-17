import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAllChurnRisks, type ChurnRiskScore } from "@/hooks/useChurnRisk";
import { AlertTriangle, TrendingDown, Activity, Loader2 } from "lucide-react";
import { format } from "date-fns";

const RISK_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-orange-500/10 text-orange-700",
  medium: "bg-yellow-500/10 text-yellow-700",
  low: "bg-green-500/10 text-green-700",
};

export const AdminChurnRiskPanel = () => {
  const { risks, isLoading } = useAllChurnRisks();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Churn Risk Monitor
          {risks.length > 0 && (
            <Badge className="bg-destructive/10 text-destructive text-xs">{risks.length} at risk</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No high-risk accounts detected</p>
        ) : (
          <div className="space-y-3">
            {risks.map((risk) => (
              <div key={risk.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${RISK_COLORS[risk.risk_level] || ""}`}>
                      {risk.risk_level.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">Score: {risk.risk_score}/100</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {risk.computed_at && format(new Date(risk.computed_at), "MMM d, HH:mm")}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Inactive:</span>
                    <span className="font-medium text-foreground">{risk.days_inactive}d</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Logins/30d:</span>
                    <span className="font-medium text-foreground">{risk.login_count_30d}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="font-medium text-foreground ml-1">{risk.usage_trend}</span>
                  </div>
                </div>

                {risk.signals && risk.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {risk.signals.map((signal, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {signal}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
