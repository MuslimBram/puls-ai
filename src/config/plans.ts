export type {
  Plan,
  PlanFeatures,
  PlanKey,
  PlanLimits,
  PackageVariant,
  MediaAddonPack,
} from "@/types/monetization";

export {
  DEFAULT_PLAN_KEY,
  FEATURE_KEYS,
  isPlanKey,
} from "@/types/monetization";

export { MEDIA_ADDON_PACKS } from "@/config/mediaAddons";

export const PACKAGE_VARIANTS = [
  { type: "monthly", label: "Monthly", durationMonths: 1, discountPercent: 0, referralEligible: false },
  { type: "3-month", label: "3 Months", durationMonths: 3, discountPercent: 5, referralEligible: true },
  { type: "6-month", label: "6 Months", durationMonths: 6, discountPercent: 10, referralEligible: true },
  { type: "yearly", label: "Yearly", durationMonths: 12, discountPercent: 15, referralEligible: true },
] as const;

/** Freelancer/Referral partners use the same package discounts as everyone. */
export const FREELANCER_PACKAGE_VARIANTS = PACKAGE_VARIANTS;

/**
 * Partner referral/commission rates are account-configured and are not defined
 * as public fixed percentages in this frontend plan configuration.
 */

/** Minimum active paid referred businesses for freelancer pricing eligibility. */
export const FREELANCER_MIN_ACTIVE_REFERRALS = 3;

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
