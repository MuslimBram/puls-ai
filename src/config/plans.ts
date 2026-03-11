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

export const FEATURE_COMPARISON: FeatureSection[] = [
  {
    title: "Publishing & Content Planning",
    features: [
      { name: "Social profiles", standard: "5", professional: "Unlimited", advanced: "Unlimited", enterprise: "Custom" },
      { name: "Basic publishing tools", standard: true, professional: true, advanced: true, enterprise: true },
      { name: "Bulk scheduling", tooltip: "Schedule multiple posts at once across channels", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Instagram grid planning", tooltip: "Visual Instagram feed planner", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "AI content enhancement", tooltip: "AI-powered content suggestions and optimization", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Campaign tagging", standard: false, professional: true, advanced: true, enterprise: true },
    ],
  },
  {
    title: "Engagement & Customer Care",
    features: [
      { name: "Unified social inbox", standard: true, professional: true, advanced: true, enterprise: true },
      { name: "Keyword monitoring", standard: "10 keywords", professional: "50 keywords", advanced: "100 keywords", enterprise: "Unlimited" },
      { name: "AI replies per day", standard: "20", professional: "100", advanced: "500", enterprise: "Unlimited" },
      { name: "Conversation history", standard: "90 days", professional: "1 year", advanced: "2 years", enterprise: "Unlimited" },
      { name: "Saved replies", tooltip: "Reusable reply templates", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Approval workflow", tooltip: "Multi-step approval for outgoing replies", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Chatbot automation", tooltip: "AI chatbot workflows for auto-replies", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "Sentiment classification", tooltip: "Automatic sentiment analysis on messages", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "Case routing", tooltip: "Route conversations to specific team members", standard: false, professional: false, advanced: true, enterprise: true },
    ],
  },
  {
    title: "Reporting & Analytics",
    features: [
      { name: "Basic analytics reports", standard: true, professional: true, advanced: true, enterprise: true },
      { name: "Engagement reporting", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Competitor reports", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Custom branding reports", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "Team productivity reports", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "Automation rule builder", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "Scheduled reports delivery", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "Full reporting suite", standard: false, professional: false, advanced: false, enterprise: true },
    ],
  },
  {
    title: "Integrations",
    features: [
      { name: "Core integrations", tooltip: "Telegram, Email, Webhook, Website Chat", standard: true, professional: true, advanced: true, enterprise: true },
      { name: "E-commerce integrations", tooltip: "Shopify, WooCommerce, etc.", standard: false, professional: true, advanced: true, enterprise: true },
      { name: "BI integrations", tooltip: "Connect to business intelligence platforms", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "CRM integrations", tooltip: "Salesforce, HubSpot, etc.", standard: false, professional: false, advanced: true, enterprise: true },
      { name: "API access", tooltip: "Full REST API for custom integrations", standard: false, professional: false, advanced: false, enterprise: true },
    ],
  },
  {
    title: "Support",
    features: [
      { name: "Support availability", standard: "24/5", professional: "24/7", advanced: "24/7 Priority", enterprise: "Dedicated Manager" },
      { name: "Custom onboarding", standard: false, professional: false, advanced: false, enterprise: true },
      { name: "SLA support", standard: false, professional: false, advanced: false, enterprise: true },
      { name: "Dedicated success manager", standard: false, professional: false, advanced: false, enterprise: true },
    ],
  },
  {
    title: "Security",
    features: [
      { name: "Advanced security controls", standard: false, professional: false, advanced: false, enterprise: true },
      { name: "IP whitelisting", standard: false, professional: false, advanced: false, enterprise: true },
      { name: "White-label capabilities", standard: false, professional: false, advanced: false, enterprise: true },
      { name: "Advanced permissions", standard: false, professional: true, advanced: true, enterprise: true },
    ],
  },
];

export const formatLimit = (value: number): string => {
  if (value === -1) return "Unlimited";
  return value.toString();
};
