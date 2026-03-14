import { IntegrationDefinition } from "./types";

export const EXTERNAL_INTEGRATIONS: IntegrationDefinition[] = [
  // ── Analytics & Monitoring ──
  {
    key: "talkwalker",
    name: "Talkwalker",
    category: "analytics_monitoring",
    description: "Trend monitoring & sentiment analysis across social media and news.",
    icon: "BarChart3",
    credentialFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "project_id", label: "Project ID", type: "text", required: true },
    ],
    defaultConfig: { scanInterval: 60, topics: [] },
    minPlan: "professional",
    rateLimitPerHour: 4,
    minScanIntervalMinutes: 60,
  },
  {
    key: "brand_analytics",
    name: "Brand Analytics",
    category: "analytics_monitoring",
    description: "Keyword & brand mention tracking across web and social platforms.",
    icon: "Search",
    credentialFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "brand_id", label: "Brand ID", type: "text", required: true },
    ],
    defaultConfig: { keywords: [], mentionTypes: ["direct", "indirect"] },
    minPlan: "professional",
    rateLimitPerHour: 6,
    minScanIntervalMinutes: 30,
  },
  {
    key: "telegram_analytics",
    name: "Telegram Analytics",
    category: "analytics_monitoring",
    description: "Custom bot ingestion for Telegram channel/group analytics.",
    icon: "MessageSquare",
    credentialFields: [
      { key: "bot_token", label: "Bot Token", type: "password", required: true },
      { key: "channel_ids", label: "Channel IDs (comma-separated)", type: "text", required: false },
    ],
    defaultConfig: { trackEngagement: true, trackGrowth: true },
    minPlan: "standard",
    rateLimitPerHour: 10,
    minScanIntervalMinutes: 30,
  },
  {
    key: "whatsapp_analytics",
    name: "WhatsApp Analytics",
    category: "analytics_monitoring",
    description: "Webhook-based WhatsApp message and engagement analytics.",
    icon: "Phone",
    credentialFields: [
      { key: "webhook_secret", label: "Webhook Secret", type: "password", required: true },
      { key: "phone_number_id", label: "Phone Number ID", type: "text", required: true },
    ],
    defaultConfig: { trackDelivery: true, trackRead: true },
    minPlan: "professional",
    rateLimitPerHour: 20,
    minScanIntervalMinutes: 30,
  },

  // ── Publishing & Management ──
  {
    key: "hootsuite",
    name: "Hootsuite",
    category: "publishing_management",
    description: "Schedule and manage social media posts across multiple networks.",
    icon: "Calendar",
    credentialFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "organization_id", label: "Organization ID", type: "text", required: false },
    ],
    defaultConfig: { autoSchedule: false, defaultNetworks: [] },
    minPlan: "professional",
    rateLimitPerHour: 10,
    minScanIntervalMinutes: 60,
  },
  {
    key: "buffer",
    name: "Buffer",
    category: "publishing_management",
    description: "Social media publishing and analytics platform.",
    icon: "Layers",
    credentialFields: [
      { key: "access_token", label: "Access Token", type: "password", required: true },
    ],
    defaultConfig: { autoPublish: false, profiles: [] },
    minPlan: "standard",
    rateLimitPerHour: 10,
    minScanIntervalMinutes: 60,
  },
  {
    key: "zoho_social",
    name: "Zoho Social",
    category: "publishing_management",
    description: "Social media management with CRM integration.",
    icon: "Share2",
    credentialFields: [
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      { key: "refresh_token", label: "Refresh Token", type: "password", required: true },
    ],
    defaultConfig: { syncWithCRM: false },
    minPlan: "professional",
    rateLimitPerHour: 8,
    minScanIntervalMinutes: 60,
  },

  // ── Automation & Messaging ──
  {
    key: "manychat",
    name: "ManyChat",
    category: "automation_messaging",
    description: "Webhook adapter for incoming & outgoing ManyChat automation events.",
    icon: "Bot",
    credentialFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "page_id", label: "Page ID", type: "text", required: true },
    ],
    defaultConfig: { syncContacts: false, webhookEvents: ["message", "subscriber"] },
    minPlan: "professional",
    rateLimitPerHour: 20,
    minScanIntervalMinutes: 30,
  },

  // ── OSINT Monitoring ──
  {
    key: "osint_monitor",
    name: "OSINT Monitor",
    category: "osint_monitoring",
    description: "ShadowDragon-like monitoring simulation via configurable crawler targets.",
    icon: "Eye",
    credentialFields: [],
    defaultConfig: {
      targets: [],
      crawlDepth: 2,
      platforms: ["web", "social", "forums"],
      alertOnMatch: true,
    },
    minPlan: "advanced",
    rateLimitPerHour: 2,
    minScanIntervalMinutes: 60,
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  analytics_monitoring: "Analytics & Monitoring",
  publishing_management: "Publishing & Management",
  automation_messaging: "Automation & Messaging",
  osint_monitoring: "Investigative / OSINT",
};
