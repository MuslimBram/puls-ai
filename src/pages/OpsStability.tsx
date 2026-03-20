import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOpsStability } from "@/hooks/useOpsStability";
import { Activity, CheckCircle2, AlertTriangle, XCircle, Gauge } from "lucide-react";

const OpsStability = () => {
  const { checks, healthy, degraded, down, avgLatency, isLoading } = useOpsStability();

  const statusIcon = (status: string) => {
    if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === "degraded") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operational Stability</h1>
          <p className="text-muted-foreground">Queue health, AI cost control, and channel connection diagnostics.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{healthy}</p>
            <p className="text-xs text-muted-foreground">Healthy</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{degraded}</p>
            <p className="text-xs text-muted-foreground">Degraded</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold">{down}</p>
            <p className="text-xs text-muted-foreground">Down</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Gauge className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{avgLatency}ms</p>
            <p className="text-xs text-muted-foreground">Avg Latency</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold text-foreground mb-3">System Health Checks</h3>
            {checks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No health check data yet. System monitors will populate this automatically.</p>
            ) : (
              <div className="space-y-2">
                {checks.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      {statusIcon(c.status ?? "healthy")}
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.component}</p>
                        <p className="text-xs text-muted-foreground">{c.check_type} · {new Date(c.checked_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.latency_ms && <span className="text-xs text-muted-foreground">{c.latency_ms}ms</span>}
                      <Badge variant={c.status === "healthy" ? "default" : c.status === "degraded" ? "secondary" : "destructive"}>{c.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {checks.some(c => c.error_message) && (
          <Card>
            <CardContent className="py-4">
              <h3 className="font-semibold text-foreground mb-3">Recent Errors</h3>
              <div className="space-y-2">
                {checks.filter(c => c.error_message).map(c => (
                  <div key={c.id} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-foreground">{c.component}</p>
                    <p className="text-xs text-destructive mt-1">{c.error_message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default OpsStability;
