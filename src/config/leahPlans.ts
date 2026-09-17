export type LeahPlanKey = "free" | "starter" | "growth" | "pro" | "enterprise";

export interface LeahPlan {
  key: LeahPlanKey;
  name: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  monthlyAiCredits: number;
  monthlyMessages: number;
  memoryDays: number;
  connectedChannels: number;
  pluginConnections: number;
}

/**
 * Product-facing LEAH limits. Billing/entitlement remains server authoritative.
 * These values are a safe UI fallback and should be replaced by pricing_settings
 * when the server catalog is available.
 */
export const LEAH_PLANS: LeahPlan[] = [
  { key: "free", name: "LEAH Free", monthlyPriceUsd: 0, annualPriceUsd: 0, monthlyAiCredits: 100, monthlyMessages: 50, memoryDays: 7, connectedChannels: 1, pluginConnections: 2 },
  { key: "starter", name: "LEAH Starter", monthlyPriceUsd: 9, annualPriceUsd: 90, monthlyAiCredits: 2500, monthlyMessages: 750, memoryDays: 30, connectedChannels: 3, pluginConnections: 5 },
  { key: "growth", name: "LEAH Growth", monthlyPriceUsd: 29, annualPriceUsd: 290, monthlyAiCredits: 10000, monthlyMessages: 3000, memoryDays: 90, connectedChannels: 8, pluginConnections: 15 },
  { key: "pro", name: "LEAH Pro", monthlyPriceUsd: 79, annualPriceUsd: 790, monthlyAiCredits: 50000, monthlyMessages: 15000, memoryDays: 365, connectedChannels: 20, pluginConnections: 50 },
  { key: "enterprise", name: "LEAH Enterprise", monthlyPriceUsd: 199, annualPriceUsd: 1990, monthlyAiCredits: 250000, monthlyMessages: 75000, memoryDays: 0, connectedChannels: -1, pluginConnections: -1 },
];

export const getLeahPlan = (key: LeahPlanKey) => LEAH_PLANS.find((plan) => plan.key === key) ?? LEAH_PLANS[0];
