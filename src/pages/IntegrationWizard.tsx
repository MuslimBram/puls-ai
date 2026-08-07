import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, ExternalLink, RefreshCw, Plug } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Integration {
  name: string;
  status: string;
  required: boolean;
  details?: string;
  action_url?: string;
  plan_required: string;
}

export default function IntegrationWizard() {
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [pct, setPct] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-wizard?action=check`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (d.integrations) {
        setIntegrations(d.integrations);
        setPct(d.completion_pct ?? 0);
        setMissing(d.required_missing ?? []);
      }
    } catch {
      toast({ title: "Could not check integrations", variant: "destructive" });
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const statusBadge = (s: string) => {
    if (s === "connected") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Active</Badge>;
    if (s === "error") return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Error</Badge>;
    return <Badge variant="secondary" className="text-xs">Not active</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Plug className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">Integration Wizard</h1>
          </div>
          <Button variant="outline" size="sm" onClick={check} disabled={checking}>
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />Re-check
          </Button>
        </header>

        <Card className="mb-6">
          <CardContent className="pt-5">
            <div className="flex justify-between mb-2">
              <span className="font-medium text-sm">Progress</span>
              <span className="text-2xl font-semibold text-primary">{pct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            {missing.length > 0 ? (
              <p className="text-xs text-amber-600 mt-2">Missing: {missing.join(", ")}</p>
            ) : (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" />All key integrations are active.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {Object.entries(integrations).map(([key, int]) => (
            <Card key={key} className={int.status === "connected" ? "border-green-200" : ""}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                {int.status === "connected"
                  ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{int.name}</span>
                    {int.required && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Required</Badge>}
                  </div>
                  {int.details && <p className="text-xs text-muted-foreground mt-0.5">{int.details}</p>}
                </div>
                {statusBadge(int.status)}
                {int.status !== "connected" && int.action_url && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                    <a href={int.action_url}>Set up<ExternalLink className="ml-1 h-3 w-3" /></a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
