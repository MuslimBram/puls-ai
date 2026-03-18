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
  { type: "3-month", label: "3 months", durationMonths: 3, discountPercent: 5, referralEligible: true },
  { type: "6-month", label: "6 months", durationMonths: 6, discountPercent: 10, referralEligible: true },
  { type: "yearly", label: "12 months", durationMonths: 12, discountPercent: 20, referralEligible: true },
] as const;

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
