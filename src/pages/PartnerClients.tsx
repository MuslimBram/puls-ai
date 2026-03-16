import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePartnerAccount } from "@/hooks/usePartner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Loader2, TrendingUp, TrendingDown, ArrowUpCircle, DollarSign, Activity } from "lucide-react";
import { format } from "date-fns";

interface ReferredBusiness {
  id: string;
  name: string;
  created_at: string;
  plan: string;
  subscription_status: string;
  last_payment_at: string | null;
  commission_generated: number;
  activity_score: number;
  churn_risk: "low" | "medium" | "high";
}

const usePartnerClients = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["partner-clients", partnerId],
    queryFn: async (): Promise<ReferredBusiness[]> => {
      // Get referred workspaces
      const { data: workspaces, error } = await supabase
        .from("workspaces")
        .select("id, name, created_at")
        .eq("referred_by_partner_id", partnerId!) as any;
      if (error) throw error;
      if (!workspaces?.length) return [];

      const results: ReferredBusiness[] = [];

      for (const ws of workspaces) {
        // Get subscription
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan, subscription_status, billing_cycle_start, leads_used, ai_replies_today")
          .eq("workspace_id", ws.id)
          .maybeSingle();

        // Get total commissions
        const { data: comms } = await supabase
          .from("partner_commissions")
          .select("commission_amount")
          .eq("partner_id", partnerId!)
          .eq("workspace_id", ws.id);

        const totalComm = (comms || []).reduce((s, c) => s + Number(c.commission_amount), 0);

        // Activity score (based on usage)
        const leadsUsed = sub?.leads_used || 0;
        const aiUsed = sub?.ai_replies_today || 0;
        const activityScore = Math.min(100, (leadsUsed * 2) + (aiUsed * 3));

        // Churn risk heuristic
        let churnRisk: "low" | "medium" | "high" = "low";
        if (sub?.subscription_status === "past_due") churnRisk = "high";
        else if (activityScore < 10) churnRisk = "medium";
        else if (sub?.subscription_status === "canceled") churnRisk = "high";

        results.push({
          id: ws.id,
          name: ws.name || "Unnamed Workspace",
          created_at: ws.created_at,
          plan: sub?.plan || "standard",
          subscription_status: sub?.subscription_status || "none",
          last_payment_at: sub?.billing_cycle_start || null,
          commission_generated: totalComm,
          activity_score: activityScore,
          churn_risk: churnRisk,
        });
      }

      return results;
    },
    enabled: !!partnerId,
  });
};

const riskColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-700",
  medium: "bg-yellow-500/10 text-yellow-700",
  high: "bg-destructive/10 text-destructive",
};

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-700",
  trialing: "bg-blue-500/10 text-blue-700",
  past_due: "bg-yellow-500/10 text-yellow-700",
  canceled: "bg-destructive/10 text-destructive",
  none: "bg-muted text-muted-foreground",
};

const PartnerClients = () => {
  const { data: partner, isLoading: partnerLoading } = usePartnerAccount();
  const { data: clients, isLoading: clientsLoading } = usePartnerClients(partner?.id || null);

  if (partnerLoading || clientsLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (!partner || partner.status !== "active") {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Partner account required to view clients.</p>
        </div>
      </DashboardLayout>
    );
  }

  const activeClients = clients?.filter(c => c.subscription_status === "active") || [];
  const churnedClients = clients?.filter(c => ["canceled", "unpaid"].includes(c.subscription_status)) || [];
  const totalMRR = activeClients.reduce((s, c) => {
    const prices: Record<string, number> = { standard: 29, professional: 79, advanced: 149, enterprise: 399 };
    return s + (prices[c.plan] || 0);
  }, 0);
  const totalCommissions = clients?.reduce((s, c) => s + c.commission_generated, 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Referred Clients</h1>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{clients?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{activeClients.length}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-foreground">${totalMRR}</p>
                  <p className="text-xs text-muted-foreground">Client MRR</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{churnedClients.length}</p>
                  <p className="text-xs text-muted-foreground">Churned</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Client List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {!clients?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No referred clients yet. Share your referral link to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground">{client.name}</p>
                        <Badge className={statusColor[client.subscription_status] || ""}>
                          {client.subscription_status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{client.plan}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Joined {format(new Date(client.created_at), "MMM d, yyyy")}</span>
                        <span>${client.commission_generated.toFixed(2)} earned</span>
                        {client.last_payment_at && (
                          <span>Last payment: {format(new Date(client.last_payment_at), "MMM d")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Activity Score */}
                      <div className="text-center">
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{client.activity_score}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Activity</p>
                      </div>
                      {/* Churn Risk */}
                      <Badge className={riskColor[client.churn_risk]}>
                        {client.churn_risk === "high" ? "⚠ High Risk" : client.churn_risk === "medium" ? "Medium" : "Low Risk"}
                      </Badge>
                      {/* Upgrade Suggestion */}
                      {client.plan === "standard" && client.activity_score > 30 && (
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <ArrowUpCircle className="h-3 w-3" />
                          <span>Upgrade candidate</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PartnerClients;
