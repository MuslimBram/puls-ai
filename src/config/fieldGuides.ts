export interface FieldGuide {
  fieldId: string;
  title: string;
  explanation: string;
  importance: string;
  howToFind: string;
  examples: string[];
  aiEnabled: boolean;
}

export const competitorFieldGuides: FieldGuide[] = [
  {
    fieldId: "competitor_name",
    title: "Competitor Name",
    explanation: "The official business name of a company competing in your market space.",
    importance: "Accurate naming ensures proper tracking and avoids duplicate entries in your intelligence dashboard.",
    howToFind: "Search your industry on Google, check industry directories, or ask your sales team who they lose deals to.",
    examples: ["Acme Digital Solutions", "TechFlow Agency", "GrowthHive Marketing"],
    aiEnabled: true,
  },
  {
    fieldId: "competitor_website",
    title: "Website URL",
    explanation: "The primary website address of the competitor. Used for automated scanning and content analysis.",
    importance: "The website is the main source for AI-powered analysis of positioning, pricing, services, and content strategy.",
    howToFind: "Google the company name, check their social media profiles for website links, or use LinkedIn company pages.",
    examples: ["https://acmedigital.com", "https://www.techflow.io", "https://growthhive.co"],
    aiEnabled: false,
  },
  {
    fieldId: "competitor_category",
    title: "Competitor Category",
    explanation: "Classifies how this competitor relates to your business — direct, indirect, or aspirational.",
    importance: "Categorization helps prioritize monitoring. Direct competitors need frequent scanning; aspirational ones inform strategy.",
    howToFind: "Direct = same services & audience. Indirect = similar audience, different approach. Aspirational = where you want to be.",
    examples: ["Direct: Same SaaS product category", "Indirect: Different solution, same problem", "Aspirational: Market leader you admire"],
    aiEnabled: false,
  },
  {
    fieldId: "competitor_scan_frequency",
    title: "Scan Frequency",
    explanation: "How often the system automatically scans the competitor's website for changes.",
    importance: "Daily scanning catches promotions and pricing changes quickly. Weekly is sufficient for strategic tracking.",
    howToFind: "Consider how aggressively this competitor changes their strategy. More active = more frequent scanning needed.",
    examples: ["Daily: Fast-moving competitor with frequent promotions", "Weekly: Stable competitor for strategic tracking", "Manual: Only scan when needed"],
    aiEnabled: false,
  },
];

export const campaignFieldGuides: FieldGuide[] = [
  {
    fieldId: "campaign_name",
    title: "Campaign Name",
    explanation: "A descriptive name that identifies this marketing campaign internally.",
    importance: "Clear naming helps your team identify campaigns quickly and track performance over time.",
    howToFind: "Use a format like: [Season/Event] + [Objective] + [Year]. Keep it concise but descriptive.",
    examples: ["Summer 2026 Lead Gen", "Q3 Brand Awareness Push", "Black Friday Sales Drive", "Product Launch - AI Suite"],
    aiEnabled: true,
  },
  {
    fieldId: "campaign_objective",
    title: "Campaign Objective",
    explanation: "The primary goal this campaign should achieve for your business.",
    importance: "The objective drives the entire AI strategy generation — content types, channels, CTAs, and KPI recommendations.",
    howToFind: "Ask: What's the #1 result we need? More leads? More sales? Brand visibility? Website traffic?",
    examples: ["Lead Generation: Capture 200 qualified leads", "Sales: Drive $50K in Q3 revenue", "Brand Awareness: Reach 100K new prospects"],
    aiEnabled: false,
  },
  {
    fieldId: "campaign_audience",
    title: "Target Audience",
    explanation: "Who this campaign is designed to reach. Can be different from your general business audience.",
    importance: "A well-defined audience produces sharper AI-generated content, better persona development, and higher conversion rates.",
    howToFind: "Review your best customers. What do they have in common? Industry, company size, role, pain points?",
    examples: [
      "SaaS founders with 10-50 employees looking to scale marketing",
      "E-commerce store owners spending $5K+/mo on ads",
      "HR managers at mid-size companies frustrated with manual processes",
    ],
    aiEnabled: true,
  },
  {
    fieldId: "campaign_budget",
    title: "Budget Range",
    explanation: "The minimum and maximum budget allocated for this campaign's execution.",
    importance: "Budget influences AI recommendations for channels, content volume, and advertising strategy.",
    howToFind: "Consider your total marketing budget and allocate based on campaign priority. Start with what you can commit to.",
    examples: ["$500-$1,000 for organic-only", "$2,000-$5,000 for mixed organic + paid", "$10,000+ for full-scale multi-channel"],
    aiEnabled: false,
  },
  {
    fieldId: "campaign_channels",
    title: "Preferred Channels",
    explanation: "The marketing channels where this campaign will be active.",
    importance: "Channel selection affects content format, posting frequency, and audience targeting in the AI strategy.",
    howToFind: "Where is your target audience most active? Check your analytics for best-performing channels.",
    examples: ["LinkedIn + Email for B2B", "Instagram + TikTok for B2C", "Facebook + Website for local business"],
    aiEnabled: false,
  },
];

export const getFieldGuide = (guides: FieldGuide[], fieldId: string): FieldGuide | undefined => {
  return guides.find((g) => g.fieldId === fieldId);
};
