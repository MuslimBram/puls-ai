import { useMemo } from "react";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Freelancer pricing logic:
 * - 1st business: normal plan pricing
 * - Each additional business: 40% discount on monthly plan price
 * - Discount applied automatically based on active business count
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
      getEffectiveMonthlyPrice: (basePrice: number) => {
        // Price for the first business (full) + discounted additional businesses
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
