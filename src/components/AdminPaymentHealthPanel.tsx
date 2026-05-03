import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { format } from "date-fns";

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

interface HealthResponse {
  generated_at: string;
  overall: "ok" | "warn" | "fail";
  checks: HealthCheck[];
  consistency?: any;
}

const statusBadge = (s: "ok" | "warn" | "fail") => {
  if (s === "ok") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">OK</Badge>;
  if (s === "warn") return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">Warning</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
};

export const AdminPaymentHealthPanel = () => {
  const health = useQuery({
    queryKey: ["payment-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("payment-health-check");
      if (error) throw error;
      return data as HealthResponse;
    },
    refetchInterval: 60_000,
  });

  const webhookFailures = useQuery({
    queryKey: ["paypal-webhook-failures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paypal_webhook_events")
        .select("*")
        .in("status", ["error", "signature_failed", "config_missing", "received"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const recentTxns = useQuery({
    queryKey: ["paypal-recent-txns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paypal_transactions")
        .select("id, paypal_order_id, status, amount, currency, payment_type, plan_key, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const data = health.data;
  const consistency: any = data?.consistency;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Payment System Health
            {data && statusBadge(data.overall)}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => health.refetch()} disabled={health.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${health.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {health.isLoading && <p className="text-sm text-muted-foreground">Running checks…</p>}
          {health.error && (
            <p className="text-sm text-destructive">Failed to load health: {(health.error as Error).message}</p>
          )}
          {data?.checks.map((c) => (
            <div key={c.name} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3">
                {c.status === "ok" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                {c.status === "warn" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                {c.status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.message}</p>
                </div>
              </div>
              {statusBadge(c.status)}
            </div>
          ))}
          {data?.generated_at && (
            <p className="text-[11px] text-muted-foreground">
              Last check: {format(new Date(data.generated_at), "MMM d, HH:mm:ss")}
            </p>
          )}
        </CardContent>
      </Card>

      {consistency && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Billing Consistency
              {consistency.is_healthy
                ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Healthy</Badge>
                : <Badge variant="destructive">Mismatches</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <Stat label="Completed without billing" value={consistency.paypal?.completed_without_billing} />
              <Stat label="Billing without transaction" value={consistency.paypal?.billing_without_transaction} />
              <Stat label="Pending > 24h" value={consistency.paypal?.pending_over_24h} />
              <Stat label="Failed (7d)" value={consistency.paypal?.failed_last_7d} muted />
              <Stat label="Webhooks unprocessed > 10m" value={consistency.webhooks?.unprocessed_over_10min} />
              <Stat label="Webhooks failed (7d)" value={consistency.webhooks?.failed_last_7d} />
              <Stat label="Paid subs without history" value={consistency.subscriptions?.paid_without_history} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            PayPal Webhook Failures
            <Badge variant="outline" className="ml-auto">{webhookFailures.data?.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {webhookFailures.data?.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No failed webhook events 🎉</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {webhookFailures.data?.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Badge variant={e.status === "received" ? "outline" : "destructive"}>{e.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.event_type}</p>
                    {e.error_message && <p className="text-xs text-destructive truncate">{e.error_message}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(e.created_at), "MMM d, HH:mm:ss")} · {e.resource_id ?? "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent PayPal Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTxns.data?.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {recentTxns.data?.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.amount} {t.currency} · {t.payment_type}{t.plan_key ? ` · ${t.plan_key}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.paypal_order_id}</p>
                  </div>
                  <Badge variant={t.status === "completed" ? "default" : t.status === "pending" ? "outline" : "destructive"}>
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, muted }: { label: string; value: number | undefined; muted?: boolean }) => (
  <div className={`rounded-md border p-3 ${value && value > 0 && !muted ? "border-destructive/40 bg-destructive/5" : ""}`}>
    <p className="text-2xl font-bold">{value ?? 0}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);
