import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAllChurnRisks, type ChurnRiskScore } from "@/hooks/useChurnRisk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AlertTriangle, TrendingDown, Activity, Loader2, Mail, Gift, MessageSquare } from "lucide-react";
import { format } from "date-fns";

const RISK_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-orange-500/10 text-orange-700",
  medium: "bg-yellow-500/10 text-yellow-700",
  low: "bg-green-500/10 text-green-700",
};

export const AdminChurnRiskPanel = () => {
  const { risks, isLoading } = useAllChurnRisks();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [outreachMsg, setOutreachMsg] = useState("");
  const queryClient = useQueryClient();

  const sendOutreach = useMutation({
    mutationFn: async ({ userId, message, type }: { userId: string; message: string; type: string }) => {
      const { error } = await supabase.from("business_notifications").insert({
        user_id: userId,
        title: type === "incentive" ? "🎁 Special Offer for You" : "💬 We Miss You!",
        message,
        notification_type: "system",
        category: "engagement",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outreach notification sent");
      setExpandedId(null);
      setOutreachMsg("");
    },
    onError: (e) => toast.error(e.message),
  });

  const extendTrial = useMutation({
    mutationFn: async (userId: string) => {
      const extendedEnd = new Date();
      extendedEnd.setDate(extendedEnd.getDate() + 14);
      const { error } = await supabase
        .from("subscriptions")
        .update({
          trial_end: extendedEnd.toISOString(),
          subscription_status: "trialing",
        })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-churn-risks"] });
      toast.success("Trial extended by 14 days");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const criticalCount = risks.filter((r) => r.risk_level === "critical").length;
  const highCount = risks.filter((r) => r.risk_level === "high").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Churn Risk Monitor
          {criticalCount > 0 && (
            <Badge className="bg-destructive/10 text-destructive text-xs">{criticalCount} critical</Badge>
          )}
          {highCount > 0 && (
            <Badge className="bg-orange-500/10 text-orange-700 text-xs">{highCount} high</Badge>
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
                    <span className="text-xs text-muted-foreground">User: {risk.user_id.slice(0, 8)}…</span>
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
                  <div className="flex flex-wrap gap-1 mb-2">
                    {risk.signals.map((signal, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {signal}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Intervention Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setExpandedId(expandedId === risk.id ? null : risk.id)}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Outreach
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      sendOutreach.mutate({
                        userId: risk.user_id,
                        message: "We noticed you haven't been active recently. We'd love to help you get the most out of the platform — reply and let's connect!",
                        type: "reengagement",
                      })
                    }
                    disabled={sendOutreach.isPending}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    Quick Re-engage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => extendTrial.mutate(risk.user_id)}
                    disabled={extendTrial.isPending}
                  >
                    <Gift className="h-3 w-3 mr-1" />
                    Extend Trial +14d
                  </Button>
                </div>

                {/* Custom outreach message */}
                {expandedId === risk.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={outreachMsg}
                      onChange={(e) => setOutreachMsg(e.target.value)}
                      placeholder="Write a custom outreach message..."
                      className="text-sm min-h-[60px]"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        sendOutreach.mutate({ userId: risk.user_id, message: outreachMsg, type: "custom" })
                      }
                      disabled={!outreachMsg.trim() || sendOutreach.isPending}
                    >
                      Send Notification
                    </Button>
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
