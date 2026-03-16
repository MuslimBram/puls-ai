import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useToast } from "@/hooks/use-toast";

export interface FreelancerView {
  id: string;
  user_id: string;
  partner_name: string;
  status: string;
  total_businesses: number;
  monthly_revenue: number;
  commission_rate: number;
  stripe_connect_id: string | null;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
  risk_flags_count: number;
  clients: Array<{
    workspace_id: string;
    workspace_name: string;
    relationship_status: string;
    total_revenue_generated: number;
  }>;
}

export const useAdminFreelancers = () => {
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const { log } = useAuditLog();
  const { toast } = useToast();

  const freelancersQuery = useQuery({
    queryKey: ["admin-freelancers"],
    queryFn: async (): Promise<FreelancerView[]> => {
      const { data: partners, error } = await supabase
        .from("partner_accounts")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const result: FreelancerView[] = [];

      for (const p of partners || []) {
        // Get partner clients
        const { data: clients } = await supabase
          .from("partner_clients")
          .select("workspace_id, relationship_status, total_revenue_generated")
          .eq("partner_id", p.id);

        // Get workspace names
        const clientsWithNames = [];
        for (const c of clients || []) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", c.workspace_id)
            .maybeSingle();
          clientsWithNames.push({
            ...c,
            workspace_name: ws?.name || "Unknown",
          });
        }

        // Get risk flags count
        const { count } = await supabase
          .from("partner_risk_flags")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", p.id)
          .eq("is_resolved", false);

        result.push({
          id: p.id,
          user_id: p.user_id,
          partner_name: p.partner_name,
          status: p.status,
          total_businesses: p.total_businesses || 0,
          monthly_revenue: p.monthly_revenue || 0,
          commission_rate: p.commission_rate || 10,
          stripe_connect_id: (p as any).stripe_connect_id || null,
          referral_code: p.referral_code || null,
          created_at: p.created_at,
          updated_at: p.updated_at,
          risk_flags_count: count || 0,
          clients: clientsWithNames,
        });
      }

      return result;
    },
    enabled: isAdmin,
  });

  const reassignBusiness = useMutation({
    mutationFn: async ({ workspaceId, newPartnerId }: { workspaceId: string; newPartnerId: string | null }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ workspace_owner_partner_id: newPartnerId } as any)
        .eq("id", workspaceId);
      if (error) throw error;

      // Update partner_clients
      if (newPartnerId) {
        await supabase.from("partner_clients").upsert({
          partner_id: newPartnerId,
          workspace_id: workspaceId,
          relationship_status: "active",
        } as any, { onConflict: "partner_id,workspace_id" });
      }
    },
    onSuccess: async (_, vars) => {
      await log("partner_reassignment", "workspace", vars.workspaceId, {
        new_partner_id: vars.newPartnerId,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-freelancers"] });
      toast({ title: "Business reassigned" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const approvePayout = useMutation({
    mutationFn: async ({ payoutId, adminNote }: { payoutId: string; adminNote?: string }) => {
      const { error } = await supabase
        .from("payout_requests")
        .update({
          payout_status: "sent",
          admin_note: adminNote || "Approved and processed",
          processed_at: new Date().toISOString(),
        } as any)
        .eq("id", payoutId);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await log("payout_approval", "payout", vars.payoutId);
      queryClient.invalidateQueries({ queryKey: ["admin-freelancers"] });
      queryClient.invalidateQueries({ queryKey: ["payout-requests"] });
      toast({ title: "Payout approved" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return {
    freelancers: freelancersQuery.data ?? [],
    isLoading: freelancersQuery.isLoading,
    reassignBusiness,
    approvePayout,
  };
};
