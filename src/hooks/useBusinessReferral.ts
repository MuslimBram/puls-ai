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

const QUALIFYING_PACKAGES = ["3-month", "6-month"];

export const useReferralEligibility = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["referral-eligibility", user?.id],
    queryFn: async (): Promise<ReferralEligibility> => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("referral_eligible, referral_eligible_at, qualifying_package_type, package_type, subscription_status")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!sub) {
        return { eligible: false, reason: "No active subscription found.", packageType: null, eligibleAt: null };
      }

      if (sub.referral_eligible) {
        return {
          eligible: true,
          reason: "You are eligible to refer businesses!",
          packageType: sub.qualifying_package_type,
          eligibleAt: sub.referral_eligible_at,
        };
      }

      if (!["active", "trialing"].includes(sub.subscription_status)) {
        return { eligible: false, reason: "An active subscription is required to refer businesses.", packageType: null, eligibleAt: null };
      }

      const currentPkg = sub.package_type || "monthly";
      if (!QUALIFYING_PACKAGES.includes(currentPkg)) {
        return {
          eligible: false,
          reason: "A 3-month or 6-month package is required. Upgrade your package to unlock referrals.",
          packageType: currentPkg,
          eligibleAt: null,
        };
      }

      return { eligible: false, reason: "Processing eligibility...", packageType: currentPkg, eligibleAt: null };
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
      const code = `BIZ-${user!.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("business_referral_codes").insert({
        user_id: user!.id,
        referral_code: code,
      } as any);
      if (error) throw error;

      await supabase.from("subscriptions").update({
        referral_eligible: true,
        referral_eligible_at: new Date().toISOString(),
      }).eq("user_id", user!.id);

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
