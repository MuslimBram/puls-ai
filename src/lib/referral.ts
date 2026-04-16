/**
 * Build a referral link using the official Pulse AI brand domain
 * (kohablerjeve.top). Always returns the branded URL so links shared
 * by users look professional regardless of where they were generated.
 */
export const REFERRAL_BASE_URL = "https://kohablerjeve.top";

export const buildReferralLink = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return `${REFERRAL_BASE_URL}/register?ref=${encodeURIComponent(code)}`;
};
