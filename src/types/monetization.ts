export type PlanKey = "standard" | "professional" | "advanced" | "enterprise";

export interface PlanLimits {
  socialProfiles: number;
  channels: number;
  keywords: number;
  keywordsPerGroup: number;
  aiRepliesPerDay: number;
  automationRules: number;
  teamMembers: number;
  conversationHistoryDays: number;
  leadsPerMonth: number;
  imagesPerMonth: number;
  videosPerMonth: number;
  videoMaxSeconds: number;
}

export interface PlanFeatures {
  bulkScheduling: boolean;
  instagramGridPlanning: boolean;
  aiContentEnhancement: boolean;
  campaignTagging: boolean;
  approvalWorkflow: boolean;
  messageTagging: boolean;
  engagementReporting: boolean;
  competitorReports: boolean;
  customBrandingReports: boolean;
  ecommerceIntegrations: boolean;
  advancedPermissions: boolean;
  automationWorkflows: boolean;
  chatbotAutomation: boolean;
  sentimentClassification: boolean;
  caseRouting: boolean;
  teamProductivityReports: boolean;
  automationRuleBuilder: boolean;
  biIntegrations: boolean;
  scheduledReportsDelivery: boolean;
  crmIntegrations: boolean;
  apiAccess: boolean;
  advancedSecurity: boolean;
  ipWhitelisting: boolean;
  customOnboarding: boolean;
  slaSupport: boolean;
  dedicatedSuccessManager: boolean;
  whiteLabel: boolean;
  savedReplies: boolean;
  basicAnalytics: boolean;
  advancedAnalytics: boolean;
  fullReporting: boolean;
  prioritySupport: boolean;
  unifiedInbox: boolean;
  keywordMonitoring: boolean;
  basicPublishing: boolean;
  coreIntegrations: boolean;
  mediaGeneration: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  limits: PlanLimits;
  features: PlanFeatures;
  cta: string;
  highlighted?: boolean;
  support: string;
}

export interface PackageVariant {
  type: "monthly" | "3-month" | "6-month" | "yearly";
  durationMonths: number;
  discountPercent: number;
  referralEligible: boolean;
}

export interface MediaAddonPack {
  type: string;
  label: string;
  quantity: number;
  price: number;
}

export const DEFAULT_PLAN_KEY: PlanKey = "standard";

export const FEATURE_KEYS = [
  "bulkScheduling",
  "instagramGridPlanning",
  "aiContentEnhancement",
  "campaignTagging",
  "approvalWorkflow",
  "messageTagging",
  "engagementReporting",
  "competitorReports",
  "customBrandingReports",
  "ecommerceIntegrations",
  "advancedPermissions",
  "automationWorkflows",
  "chatbotAutomation",
  "sentimentClassification",
  "caseRouting",
  "teamProductivityReports",
  "automationRuleBuilder",
  "biIntegrations",
  "scheduledReportsDelivery",
  "crmIntegrations",
  "apiAccess",
  "advancedSecurity",
  "ipWhitelisting",
  "customOnboarding",
  "slaSupport",
  "dedicatedSuccessManager",
  "whiteLabel",
  "savedReplies",
  "basicAnalytics",
  "advancedAnalytics",
  "fullReporting",
  "prioritySupport",
  "unifiedInbox",
  "keywordMonitoring",
  "basicPublishing",
  "coreIntegrations",
  "mediaGeneration",
] as const satisfies readonly (keyof PlanFeatures)[];

export const isPlanKey = (value: string | null | undefined): value is PlanKey =>
  value === "standard" || value === "professional" || value === "advanced" || value === "enterprise";
