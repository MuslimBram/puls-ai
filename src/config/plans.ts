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

const BASE_FEATURES: PlanFeatures = {
  bulkScheduling: false,
  instagramGridPlanning: false,
  aiContentEnhancement: false,
  campaignTagging: false,
  approvalWorkflow: false,
  messageTagging: false,
  engagementReporting: false,
  competitorReports: false,
  customBrandingReports: false,
  ecommerceIntegrations: false,
  advancedPermissions: false,
  automationWorkflows: false,
  chatbotAutomation: false,
  sentimentClassification: false,
  caseRouting: false,
  teamProductivityReports: false,
  automationRuleBuilder: false,
  biIntegrations: false,
  scheduledReportsDelivery: false,
  crmIntegrations: false,
  apiAccess: false,
  advancedSecurity: false,
  ipWhitelisting: false,
  customOnboarding: false,
  slaSupport: false,
  dedicatedSuccessManager: false,
  whiteLabel: false,
  savedReplies: false,
  basicAnalytics: true,
  advancedAnalytics: false,
  fullReporting: false,
  prioritySupport: false,
  unifiedInbox: true,
  keywordMonitoring: true,
  basicPublishing: true,
  coreIntegrations: true,
};

export const PLANS: Record<PlanKey, Plan> = {
  standard: {
    key: "standard",
    name: "Standard",
    description: "Essential tools for small businesses getting started with social engagement.",
    monthlyPrice: 29,
    annualPrice: 290,
    cta: "Try now",
    support: "24/5",
    limits: {
      socialProfiles: 5,
      channels: 3,
      keywords: 10,
      keywordsPerGroup: 10,
      aiRepliesPerDay: 20,
      automationRules: 0,
      teamMembers: 1,
      conversationHistoryDays: 90,
      leadsPerMonth: 100,
    },
    features: {
      ...BASE_FEATURES,
    },
  },
  professional: {
    key: "professional",
    name: "Professional",
    description: "Advanced features for growing teams that need more power and flexibility.",
    monthlyPrice: 79,
    annualPrice: 790,
    cta: "Try now",
    highlighted: true,
    support: "24/7",
    limits: {
      socialProfiles: -1, // unlimited
      channels: 15,
      keywords: 50,
      keywordsPerGroup: 10,
      aiRepliesPerDay: 100,
      automationRules: 0,
      teamMembers: 5,
      conversationHistoryDays: 365,
      leadsPerMonth: 500,
    },
    features: {
      ...BASE_FEATURES,
      bulkScheduling: true,
      instagramGridPlanning: true,
      aiContentEnhancement: true,
      campaignTagging: true,
      approvalWorkflow: true,
      messageTagging: true,
      engagementReporting: true,
      competitorReports: true,
      customBrandingReports: true,
      ecommerceIntegrations: true,
      advancedPermissions: true,
      savedReplies: true,
      advancedAnalytics: true,
    },
  },
  advanced: {
    key: "advanced",
    name: "Advanced",
    description: "Full automation and analytics for data-driven enterprise teams.",
    monthlyPrice: 149,
    annualPrice: 1490,
    cta: "Try now",
    support: "24/7 Priority",
    limits: {
      socialProfiles: -1,
      channels: 50,
      keywords: 100,
      keywordsPerGroup: 20,
      aiRepliesPerDay: 500,
      automationRules: 50,
      teamMembers: 20,
      conversationHistoryDays: 730,
      leadsPerMonth: 2000,
    },
    features: {
      ...BASE_FEATURES,
      bulkScheduling: true,
      instagramGridPlanning: true,
      aiContentEnhancement: true,
      campaignTagging: true,
      approvalWorkflow: true,
      messageTagging: true,
      engagementReporting: true,
      competitorReports: true,
      customBrandingReports: true,
      ecommerceIntegrations: true,
      advancedPermissions: true,
      savedReplies: true,
      advancedAnalytics: true,
      automationWorkflows: true,
      chatbotAutomation: true,
      sentimentClassification: true,
      caseRouting: true,
      teamProductivityReports: true,
      automationRuleBuilder: true,
      biIntegrations: true,
      scheduledReportsDelivery: true,
      crmIntegrations: true,
    },
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "Custom solutions with dedicated support for large organizations.",
    monthlyPrice: 399,
    annualPrice: 3990,
    cta: "Get demo",
    support: "Dedicated Manager",
    limits: {
      socialProfiles: -1,
      channels: -1,
      keywords: -1,
      keywordsPerGroup: -1,
      aiRepliesPerDay: -1,
      automationRules: -1,
      teamMembers: -1,
      conversationHistoryDays: -1,
      leadsPerMonth: -1,
    },
    features: {
      ...BASE_FEATURES,
      bulkScheduling: true,
      instagramGridPlanning: true,
      aiContentEnhancement: true,
      campaignTagging: true,
      approvalWorkflow: true,
      messageTagging: true,
      engagementReporting: true,
      competitorReports: true,
      customBrandingReports: true,
      ecommerceIntegrations: true,
      advancedPermissions: true,
      savedReplies: true,
      advancedAnalytics: true,
      automationWorkflows: true,
      chatbotAutomation: true,
      sentimentClassification: true,
      caseRouting: true,
      teamProductivityReports: true,
      automationRuleBuilder: true,
      biIntegrations: true,
      scheduledReportsDelivery: true,
      crmIntegrations: true,
      apiAccess: true,
      advancedSecurity: true,
      ipWhitelisting: true,
      customOnboarding: true,
      slaSupport: true,
      dedicatedSuccessManager: true,
      whiteLabel: true,
      fullReporting: true,
      prioritySupport: true,
    },
  },
};

export const PLAN_ORDER: PlanKey[] = ["standard", "professional", "advanced", "enterprise"];

// Feature comparison table structure
export interface FeatureRow {
  name: string;
  tooltip?: string;
  standard: string | boolean;
  professional: string | boolean;
  advanced: string | boolean;
  enterprise: string | boolean;
}

export interface FeatureSection {
  title: string;
  features: FeatureRow[];
}

// FEATURE_COMPARISON moved to src/config/featureComparison.ts
export { FEATURE_COMPARISON } from "./featureComparison";

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
