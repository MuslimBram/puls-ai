import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  FREELANCER_PACKAGE_VARIANTS,
  FREELANCER_MIN_ACTIVE_REFERRALS,
} from "@/config/plans";

/**
 * Freelancer pricing logic:
 * - Requires the configured minimum of active paid referral businesses for the pricing discount.
 * - Monthly packages: referral must be active during the package period.
 * - If the eligibility threshold is not met: full price, no discount.
 *
 * Partner/referral commission rates are intentionally not defined here. They are
 * governed by the active partner/referral configuration and commission records.
 */
export const useFreelancerPricing = () => {
  const { user } = useAuth();
  const { isFreelancer } = useRolePermissions();
  const { workspaces } = useWorkspace();

  const activeBusinessCount = workspaces.length;
  const FREELANCER_DISCOUNT_PERCENT = 40;

  // Check eligibility from DB function
  const eligibilityQuery = useQuery({
    queryKey: ["freelancer-discount-eligibility", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_freelancer_discount_eligibility", {
        _freelancer_user_id: user!.id,
      });
      if (error) throw error;
      return data as {
        eligible: boolean;
        active_paid_referrals: number;
        required: number;
        discount_percent: number;
        message: string;
      };
    },
    enabled: !!user && isFreelancer,
    staleTime: 60000,
  });

  const eligibility = eligibilityQuery.data;
  const isEligibleForDiscount = eligibility?.eligible ?? false;

  const pricing = useMemo(() => {
    // Not freelancer or not eligible for discount → full price
    if (!isFreelancer || !isEligibleForDiscount || activeBusinessCount <= 1) {
      return {
        isFreelancer,
        isEligibleForDiscount,
        activeBusinessCount,
        activePaidReferrals: eligibility?.active_paid_referrals ?? 0,
        requiredReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
        discountedBusinessCount: 0,
        discountPercent: 0,
        minActiveReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
        packageVariants: FREELANCER_PACKAGE_VARIANTS,
        eligibilityMessage: eligibility?.message ?? "",
        isLoading: eligibilityQuery.isLoading,
        getEffectiveMonthlyPrice: (basePrice: number) => basePrice,
        getTotalMonthlyPrice: (basePrice: number) => basePrice * Math.max(activeBusinessCount, 1),
      };
    }

    const discountedCount = activeBusinessCount - 1;
    const discountMultiplier = 1 - FREELANCER_DISCOUNT_PERCENT / 100;

    return {
      isFreelancer,
      isEligibleForDiscount,
      activeBusinessCount,
      activePaidReferrals: eligibility?.active_paid_referrals ?? 0,
      requiredReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
      discountedBusinessCount: discountedCount,
      discountPercent: FREELANCER_DISCOUNT_PERCENT,
      minActiveReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
      packageVariants: FREELANCER_PACKAGE_VARIANTS,
      eligibilityMessage: eligibility?.message ?? "",
      isLoading: eligibilityQuery.isLoading,
      getEffectiveMonthlyPrice: (basePrice: number) => {
        const firstBusiness = basePrice;
        const additionalBusinesses = basePrice * discountMultiplier * discountedCount;
        return Number(((firstBusiness + additionalBusinesses) / activeBusinessCount).toFixed(2));
      },
      getTotalMonthlyPrice: (basePrice: number) => {
        const firstBusiness = basePrice;
        const additionalBusinesses = basePrice * discountMultiplier * discountedCount;
        return Number((firstBusiness + additionalBusinesses).toFixed(2));
      },
    };
  }, [isFreelancer, isEligibleForDiscount, activeBusinessCount, eligibility]);

  return pricing;
};
