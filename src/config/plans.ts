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

/** Freelancer/Referral partners use the same package discounts as everyone */
export const FREELANCER_PACKAGE_VARIANTS = PACKAGE_VARIANTS;

/** Referral commission: 15% of the net subscription value */
export const FREELANCER_COMMISSION_RATE = 15;

/** Freelancer share of the management fee charged to the client: 20% */
export const FREELANCER_MANAGEMENT_FEE_RATE = 20;

/** Ambassador: 15% lifetime on every payment of a referred business */
export const AMBASSADOR_LIFETIME_RATE = 15;

/** Ambassador: extra 15% one-off bonus on a referred business' first payment */
export const AMBASSADOR_FIRST_PAYMENT_BONUS_RATE = 15;

/** Business referrer: 15% of the referred client's first payment (one time only) */
export const BUSINESS_FIRST_PAYMENT_RATE = 15;

/** Business referral discount: 15% on subscription for referred businesses */
export const BUSINESS_REFERRAL_COMMISSION_RATE = 15;

/** Minimum active paid referred businesses for freelancer 40% discount */
export const FREELANCER_MIN_ACTIVE_REFERRALS = 3;

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
