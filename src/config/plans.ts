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
  { type: "monthly", label: "Mujore", durationMonths: 1, discountPercent: 0, referralEligible: false },
  { type: "3-month", label: "3 muaj", durationMonths: 3, discountPercent: 5, referralEligible: true },
  { type: "6-month", label: "6 muaj", durationMonths: 6, discountPercent: 10, referralEligible: true },
  { type: "yearly", label: "Vjetore", durationMonths: 12, discountPercent: 15, referralEligible: true },
] as const;

/** Freelancer/Referral partners use the same package discounts as everyone */
export const FREELANCER_PACKAGE_VARIANTS = PACKAGE_VARIANTS;

/** Freelancer referral commission: 20% lifetime on referred business payments */
export const FREELANCER_COMMISSION_RATE = 20;

/** Business referral commission: 15% lifetime on referred business payments */
export const BUSINESS_REFERRAL_COMMISSION_RATE = 15;

/** Minimum active referred businesses for freelancer to stay active */
export const FREELANCER_MIN_ACTIVE_REFERRALS = 1;

export const formatLimit = (value: number): string => {
  if (value === -1) return "Pa limit";
  return value.toString();
};
