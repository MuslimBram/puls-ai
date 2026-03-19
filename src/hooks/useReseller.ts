import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ResellerClient {
  id: string;
  partner_id: string;
  workspace_id: string;
  assigned_plan: string;
  monthly_override_price: number | null;
  is_active: boolean;
  provisioned_at: string;
  notes: string | null;
  created_at: string;
  workspaces?: { name: string; slug: string | null };
}

export interface ResellerAnalytics {
  totalClients: number;
  activeClients: number;
  totalRevenue: number;
  planDistribution: Record<string, number>;
  churnedClients: number;
}

export const useResellerClients = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["reseller-clients", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_clients")
        .select("*, workspaces(name, slug)")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ResellerClient[];
    },
    enabled: !!partnerId,
  });
};

export const useResellerAnalytics = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["reseller-analytics", partnerId],
    queryFn: async (): Promise<ResellerAnalytics> => {
      const { data, error } = await supabase
        .from("reseller_clients")
        .select("*")
        .eq("partner_id", partnerId!);
      if (error) throw error;

      const clients = data || [];
      const active = clients.filter((c: any) => c.is_active);
      const planDist: Record<string, number> = {};
      let totalRev = 0;

      const planPrices: Record<string, number> = {
        free: 0, starter: 19, growth: 49, pro: 99, enterprise: 299,
      };

      for (const c of clients) {
        const plan = (c as any).assigned_plan || "standard";
        planDist[plan] = (planDist[plan] || 0) + 1;
        if ((c as any).is_active) {
          totalRev += (c as any).monthly_override_price || planPrices[plan] || 0;
        }
      }

      return {
        totalClients: clients.length,
        activeClients: active.length,
        totalRevenue: totalRev,
        planDistribution: planDist,
        churnedClients: clients.length - active.length,
      };
    },
    enabled: !!partnerId,
  });
};

export const useProvisionClient = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      partnerId,
      businessName,
      plan,
    }: {
      partnerId: string;
      businessName: string;
      plan: string;
    }) => {
      // Create workspace
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({ name: businessName, owner_id: user!.id } as any)
        .select()
        .single();
      if (wsErr) throw wsErr;

      // Link as reseller client
      const { error: linkErr } = await supabase
        .from("reseller_clients")
        .insert({
          partner_id: partnerId,
          workspace_id: (ws as any).id,
          assigned_plan: plan,
        } as any);
      if (linkErr) throw linkErr;

      // Also link as partner business
      await supabase
        .from("partner_businesses")
        .insert({
          partner_id: partnerId,
          workspace_id: (ws as any).id,
        } as any);

      return ws;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reseller-clients"] });
      qc.invalidateQueries({ queryKey: ["reseller-analytics"] });
      toast.success("Client workspace provisioned");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateClientPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, plan }: { clientId: string; plan: string }) => {
      const { error } = await supabase
        .from("reseller_clients")
        .update({ assigned_plan: plan, updated_at: new Date().toISOString() } as any)
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reseller-clients"] });
      toast.success("Plan updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
