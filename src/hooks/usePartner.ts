import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface PartnerAccount {
  id: string;
  user_id: string;
  partner_name: string;
  discount_percent: number;
  billing_model: string;
  status: string;
  total_businesses: number;
  monthly_revenue: number;
  commission_rate: number;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerBusiness {
  id: string;
  partner_id: string;
  workspace_id: string;
  added_at: string;
}

export interface ReferralStats {
  totalReferrals: number;
  activeBusinesses: number;
  totalRevenue: number;
}

export const usePartnerAccount = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner-account", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PartnerAccount | null;
    },
    enabled: !!user,
  });
};

export const usePartnerBusinesses = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["partner-businesses", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_businesses")
        .select("*, workspaces(*)")
        .eq("partner_id", partnerId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });
};

export const usePartnerReferrals = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["partner-referrals", partnerId],
    queryFn: async (): Promise<ReferralStats> => {
      // Get workspaces referred by this partner
      const { data: workspaces, error } = await supabase
        .from("workspaces")
        .select("id, created_at")
        .eq("referred_by_partner_id", partnerId!) as any;
      if (error) throw error;

      const wsIds = (workspaces || []).map((w: any) => w.id);

      let totalRevenue = 0;
      if (wsIds.length > 0) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("plan_key")
          .in("workspace_id", wsIds) as any;

        const planPrices: Record<string, number> = {
          standard: 49, professional: 99, advanced: 199, enterprise: 399,
        };
        totalRevenue = (subs || []).reduce((sum: number, s: any) => {
          return sum + (planPrices[s.plan_key] || 0);
        }, 0);
      }

      return {
        totalReferrals: (workspaces || []).length,
        activeBusinesses: wsIds.length,
        totalRevenue,
      };
    },
    enabled: !!partnerId,
  });
};

export const useApplyForPartner = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (partnerName: string) => {
      const { error } = await supabase
        .from("partner_accounts")
        .insert({ user_id: user!.id, partner_name: partnerName } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-account"] });
      toast({ title: "Application submitted", description: "Your partner application is under review." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useAddPartnerBusiness = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ partnerId, workspaceId }: { partnerId: string; workspaceId: string }) => {
      const { error } = await supabase
        .from("partner_businesses")
        .insert({ partner_id: partnerId, workspace_id: workspaceId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-businesses"] });
      toast({ title: "Business added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};
