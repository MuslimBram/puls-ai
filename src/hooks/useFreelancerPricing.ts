import { useMemo } from "react";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  FREELANCER_PACKAGE_VARIANTS,
  FREELANCER_COMMISSION_RATE,
  FREELANCER_MIN_ACTIVE_REFERRALS,
} from "@/config/plans";

/**
 * Freelancer pricing logic:
 * - Own subscription: reduced package discounts (0%, 5%, 10%, 15%)
 * - Referral commission: 20% lifetime on every referred business payment
 * - Minimum 1 active referred business to maintain freelancer status
 * - Additional businesses: 40% discount on monthly plan price
 */
export const useFreelancerPricing = () => {
  const { isFreelancer } = useRolePermissions();
  const { workspaces } = useWorkspace();

  const activeBusinessCount = workspaces.length;
  const FREELANCER_DISCOUNT_PERCENT = 40;

  const pricing = useMemo(() => {
    if (!isFreelancer || activeBusinessCount <= 1) {
      return {
        isFreelancer,
        activeBusinessCount,
        discountedBusinessCount: 0,
        discountPercent: 0,
        commissionRate: FREELANCER_COMMISSION_RATE,
        minActiveReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
        packageVariants: FREELANCER_PACKAGE_VARIANTS,
        getEffectiveMonthlyPrice: (basePrice: number) => basePrice,
        getTotalMonthlyPrice: (basePrice: number) => basePrice * Math.max(activeBusinessCount, 1),
      };
    }

    const discountedCount = activeBusinessCount - 1;
    const discountMultiplier = 1 - FREELANCER_DISCOUNT_PERCENT / 100;

    return {
      isFreelancer,
      activeBusinessCount,
      discountedBusinessCount: discountedCount,
      discountPercent: FREELANCER_DISCOUNT_PERCENT,
      commissionRate: FREELANCER_COMMISSION_RATE,
      minActiveReferrals: FREELANCER_MIN_ACTIVE_REFERRALS,
      packageVariants: FREELANCER_PACKAGE_VARIANTS,
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
  }, [isFreelancer, activeBusinessCount]);

  return pricing;
};
