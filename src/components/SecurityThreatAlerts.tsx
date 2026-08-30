import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, CheckCircle2, Clock3 } from "lucide-react";
import { format } from "date-fns";

export const SecurityThreatAlerts = () => {
  const queryClient = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["security-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_alerts")
        .select("id, workspace_id, user_id, severity, alert_type, title, summary, signals, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data || [];
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("security_alerts").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["security-alerts"] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          AI Security Monitoring
        </CardTitle>
        <CardDescription>
          Authenticated sessions are continuously scored for anomalous access patterns. Alerts are for human review; the system does not declare a person “illegal” or automatically block access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading security alerts…</div>
        ) : !alerts.length ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No open security alerts.
          </div>
        ) : alerts.map((alert) => (
          <div key={alert.id} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <Badge variant={alert.severity === "critical" || alert.severity === "high" ? "destructive" : "secondary"}>{alert.severity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{alert.summary}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(alert.id)} disabled={acknowledge.isPending}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledge
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{alert.workspace_id ? "Business workspace" : "Pulse AI platform"}</span>
              <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{format(new Date(alert.created_at), "MMM d, HH:mm")}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
