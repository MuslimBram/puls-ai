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
  { type: "3-month", label: "3 muaj", durationMonths: 3, discountPercent: 10, referralEligible: true },
  { type: "6-month", label: "6 muaj", durationMonths: 6, discountPercent: 20, referralEligible: true },
  { type: "yearly", label: "Vjetore", durationMonths: 12, discountPercent: 35, referralEligible: true },
] as const;

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
