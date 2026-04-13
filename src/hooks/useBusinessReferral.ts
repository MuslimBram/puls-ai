import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface BusinessReferralCode {
  id: string;
  user_id: string;
  referral_code: string;
  referred_count: number;
  reward_type: string;
  reward_value: number;
  is_active: boolean;
  created_at: string;
}

export interface BusinessReferral {
  id: string;
  referrer_user_id: string;
  referred_user_id: string | null;
  referred_email: string | null;
  referral_code: string;
  status: string;
  reward_status: string;
  reward_amount: number;
  subscription_plan: string | null;
  created_at: string;
  converted_at: string | null;
}

export interface ReferralEligibility {
  eligible: boolean;
  reason: string;
  packageType: string | null;
  eligibleAt: string | null;
}

export const useReferralEligibility = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["referral-eligibility", user?.id],
    queryFn: async (): Promise<ReferralEligibility> => {
      if (!user) {
        return { eligible: false, reason: "Please log in.", packageType: null, eligibleAt: null };
      }

      // Referrals are now universal — every authenticated user is eligible
      return {
        eligible: true,
        reason: "You are eligible to refer others! Earn 15% when they purchase a package.",
        packageType: null,
        eligibleAt: null,
      };
    },
    enabled: !!user,
  });
};

export const useBusinessReferralCode = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-referral-code", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_referral_codes")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BusinessReferralCode | null;
    },
    enabled: !!user,
  });
};

export const useGenerateReferralCode = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const code = `REF-${user!.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("business_referral_codes").insert({
        user_id: user!.id,
        referral_code: code,
      } as any);
      if (error) throw error;
      return code;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-referral-code"] });
      queryClient.invalidateQueries({ queryKey: ["referral-eligibility"] });
      toast({ title: "Referral code generated!", description: "Share your link to start earning rewards." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useBusinessReferrals = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-referrals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_referrals")
        .select("*")
        .eq("referrer_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BusinessReferral[];
    },
    enabled: !!user,
  });
};
