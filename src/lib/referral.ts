/**
 * Build referral links from the configured public site URL.
 *
 * Production/preview should provide VITE_PUBLIC_SITE_URL. During the domain
 * transition we keep kohablerjeve.top as a safe fallback so existing builds
 * continue to generate valid referral links until the new environment value
 * is present.
 */
const configuredSiteUrl = import.meta.env.VITE_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");

export const REFERRAL_BASE_URL = configuredSiteUrl || "https://kohablerjeve.top";

export const buildReferralLink = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return `${REFERRAL_BASE_URL}/register?ref=${encodeURIComponent(code)}`;
};
