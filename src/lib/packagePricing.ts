import { PACKAGE_VARIANTS } from "@/config/plans";
import type { PackageVariant } from "@/types/monetization";

export type PackageType = PackageVariant["type"];

export const getPackageVariant = (type: string | null | undefined): (PackageVariant & { label: string }) => {
  return (PACKAGE_VARIANTS.find((variant) => variant.type === type) as (PackageVariant & { label: string }) | undefined)
    ?? (PACKAGE_VARIANTS[0] as PackageVariant & { label: string });
};

export const getDiscountedMonthlyPrice = (baseMonthlyPrice: number, variantType: string | null | undefined) => {
  const variant = getPackageVariant(variantType);
  const multiplier = 1 - variant.discountPercent / 100;
  return Number((baseMonthlyPrice * multiplier).toFixed(2));
};

export const getPackageTotalPrice = (baseMonthlyPrice: number, variantType: string | null | undefined) => {
  const variant = getPackageVariant(variantType);
  return Number((getDiscountedMonthlyPrice(baseMonthlyPrice, variant.type) * variant.durationMonths).toFixed(2));
};

export const getPackageSavings = (baseMonthlyPrice: number, variantType: string | null | undefined) => {
  const variant = getPackageVariant(variantType);
  const fullPrice = baseMonthlyPrice * variant.durationMonths;
  return Number((fullPrice - getPackageTotalPrice(baseMonthlyPrice, variant.type)).toFixed(2));
};

export const formatPackageBadge = (variantType: string | null | undefined) => {
  const variant = getPackageVariant(variantType);
  if (variant.discountPercent <= 0) return null;
  return `Save ${variant.discountPercent}%`;
};

export const formatCommitmentLabel = (variantType: string | null | undefined) => {
  const variant = getPackageVariant(variantType);
  return variant.label;
};
