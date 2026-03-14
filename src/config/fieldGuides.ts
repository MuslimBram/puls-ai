export interface FieldGuide {
  fieldId: string;
  title: string;
  explanation: string;
  importance: string;
  howToFind: string;
  examples: string[];
  aiEnabled: boolean;
  module: string;
  validationHelp?: string;
  integrationLink?: string;
}

// ==================== BUSINESS PROFILE ====================
export const businessProfileFieldGuides: FieldGuide[] = [
  {
    fieldId: "business_name",
    title: "Business Name",
    explanation: "Your official company or brand name used across all communications.",
    importance: "AI uses this in every generated reply and campaign. It must match your public branding.",
    howToFind: "Use the exact name from your website header, business registration, or social profiles.",
    examples: ["Acme Digital Solutions", "GrowthHive Marketing", "TechFlow Agency"],
    aiEnabled: false,
    module: "business_profile",
  },
  {
    fieldId: "short_description",
    title: "Short Description",
    explanation: "A 1-2 sentence summary of what your business does and who you serve.",
    importance: "Powers AI context for lead replies, campaign copy, and content generation.",
    howToFind: "Check your website's hero section, LinkedIn company page, or elevator pitch.",
    examples: [
      "We help SaaS startups scale their marketing with AI-powered automation.",
      "Full-service digital agency specializing in e-commerce growth.",
    ],
    aiEnabled: true,
    module: "business_profile",
  },
  {
    fieldId: "industry",
    title: "Industry",
    explanation: "The primary sector or market your business operates in.",
    importance: "Drives keyword suggestions, competitor matching, and AI tone calibration.",
    howToFind: "Think about where your business fits: Technology, Marketing, Healthcare, Finance, etc.",
    examples: ["Technology", "Digital Marketing", "E-commerce", "SaaS", "Consulting"],
    aiEnabled: false,
    module: "business_profile",
  },
  {
    fieldId: "target_audience",
    title: "Target Audience",
    explanation: "The primary group of people or businesses you want to reach.",
    importance: "AI tailors lead scoring, reply tone, and campaign targeting based on your audience.",
    howToFind: "Review your best customers. What do they have in common? Industry, size, role, pain points?",
    examples: [
      "Small business owners with 5-50 employees",
      "SaaS founders looking to scale marketing",
      "E-commerce store owners spending $5K+/mo on ads",
    ],
    aiEnabled: true,
    module: "business_profile",
  },
  {
    fieldId: "main_services",
    title: "Main Services",
    explanation: "The core products or services your business offers.",
    importance: "AI references these when crafting replies, suggesting campaigns, and matching leads.",
    howToFind: "List your top 3-5 services from your website's services page or sales deck.",
    examples: [
      "SEO, PPC Management, Content Marketing",
      "Web Development, Mobile Apps, Cloud Infrastructure",
      "Business Consulting, Strategy, Market Research",
    ],
    aiEnabled: true,
    module: "business_profile",
  },
  {
    fieldId: "mission_values",
    title: "Mission & Values",
    explanation: "Your company's purpose and core principles.",
    importance: "AI incorporates these into brand-consistent messaging and campaign themes.",
    howToFind: "Check your About page, company handbook, or founding documents.",
    examples: [
      "Empowering small businesses through accessible technology",
      "Innovation, transparency, and customer success drive everything we do",
    ],
    aiEnabled: true,
    module: "business_profile",
  },
  {
    fieldId: "ai_tone",
    title: "AI Tone",
    explanation: "The communication style AI will use when writing on your behalf.",
    importance: "Ensures consistent brand voice across all AI-generated content and replies.",
    howToFind: "How do you speak to clients? Professional but warm? Casual and direct? Formal and authoritative?",
    examples: ["Professional", "Friendly", "Casual", "Formal", "Persuasive"],
    aiEnabled: false,
    module: "business_profile",
  },
  {
    fieldId: "language",
    title: "Primary Language",
    explanation: "The main language for AI-generated content and replies.",
    importance: "AI generates all content in this language. Choose the language your audience speaks.",
    howToFind: "What language does your target audience primarily communicate in?",
    examples: ["English", "Arabic", "Spanish", "French", "German"],
    aiEnabled: false,
    module: "business_profile",
  },
];

// ==================== COMPETITORS ====================
export const competitorFieldGuides: FieldGuide[] = [
  {
    fieldId: "competitor_name",
    title: "Competitor Name",
    explanation: "The official business name of a company competing in your market space.",
    importance: "Accurate naming ensures proper tracking and avoids duplicate entries in your intelligence dashboard.",
    howToFind: "Search your industry on Google, check industry directories, or ask your sales team who they lose deals to.",
    examples: ["Acme Digital Solutions", "TechFlow Agency", "GrowthHive Marketing"],
    aiEnabled: true,
    module: "competitors",
  },
  {
    fieldId: "competitor_website",
    title: "Website URL",
    explanation: "The primary website address of the competitor. Used for automated scanning and content analysis.",
    importance: "The website is the main source for AI-powered analysis of positioning, pricing, services, and content strategy.",
    howToFind: "Google the company name, check their social media profiles for website links, or use LinkedIn company pages.",
    examples: ["https://acmedigital.com", "https://www.techflow.io", "https://growthhive.co"],
    aiEnabled: false,
    module: "competitors",
  },
  {
    fieldId: "competitor_category",
    title: "Competitor Category",
    explanation: "Classifies how this competitor relates to your business — direct, indirect, or aspirational.",
    importance: "Categorization helps prioritize monitoring. Direct competitors need frequent scanning; aspirational ones inform strategy.",
    howToFind: "Direct = same services & audience. Indirect = similar audience, different approach. Aspirational = where you want to be.",
    examples: ["Direct: Same SaaS product category", "Indirect: Different solution, same problem", "Aspirational: Market leader you admire"],
    aiEnabled: false,
    module: "competitors",
  },
  {
    fieldId: "competitor_scan_frequency",
    title: "Scan Frequency",
    explanation: "How often the system automatically scans the competitor's website for changes.",
    importance: "Daily scanning catches promotions and pricing changes quickly. Weekly is sufficient for strategic tracking.",
    howToFind: "Consider how aggressively this competitor changes their strategy. More active = more frequent scanning needed.",
    examples: ["Daily: Fast-moving competitor", "Weekly: Stable competitor", "Manual: Only scan when needed"],
    aiEnabled: false,
    module: "competitors",
  },
];

// ==================== CAMPAIGNS ====================
export const campaignFieldGuides: FieldGuide[] = [
  {
    fieldId: "campaign_name",
    title: "Campaign Name",
    explanation: "A descriptive name that identifies this marketing campaign internally.",
    importance: "Clear naming helps your team identify campaigns quickly and track performance over time.",
    howToFind: "Use a format like: [Season/Event] + [Objective] + [Year]. Keep it concise but descriptive.",
    examples: ["Summer 2026 Lead Gen", "Q3 Brand Awareness Push", "Black Friday Sales Drive"],
    aiEnabled: true,
    module: "campaigns",
  },
  {
    fieldId: "campaign_objective",
    title: "Campaign Objective",
    explanation: "The primary goal this campaign should achieve for your business.",
    importance: "The objective drives the entire AI strategy generation — content types, channels, CTAs, and KPI recommendations.",
    howToFind: "Ask: What's the #1 result we need? More leads? More sales? Brand visibility? Website traffic?",
    examples: ["Lead Generation: Capture 200 qualified leads", "Sales: Drive $50K in Q3 revenue", "Brand Awareness: Reach 100K new prospects"],
    aiEnabled: false,
    module: "campaigns",
  },
  {
    fieldId: "campaign_audience",
    title: "Target Audience",
    explanation: "Who this campaign is designed to reach. Can be different from your general business audience.",
    importance: "A well-defined audience produces sharper AI-generated content and higher conversion rates.",
    howToFind: "Review your best customers. What do they have in common? Industry, company size, role, pain points?",
    examples: [
      "SaaS founders with 10-50 employees",
      "E-commerce store owners spending $5K+/mo on ads",
      "HR managers at mid-size companies",
    ],
    aiEnabled: true,
    module: "campaigns",
  },
  {
    fieldId: "campaign_budget",
    title: "Budget Range",
    explanation: "The minimum and maximum budget allocated for this campaign's execution.",
    importance: "Budget influences AI recommendations for channels, content volume, and advertising strategy.",
    howToFind: "Consider your total marketing budget and allocate based on campaign priority.",
    examples: ["$500-$1,000 for organic-only", "$2,000-$5,000 for mixed", "$10,000+ for full-scale"],
    aiEnabled: false,
    module: "campaigns",
  },
  {
    fieldId: "campaign_channels",
    title: "Preferred Channels",
    explanation: "The marketing channels where this campaign will be active.",
    importance: "Channel selection affects content format, posting frequency, and audience targeting.",
    howToFind: "Where is your target audience most active? Check your analytics for best-performing channels.",
    examples: ["LinkedIn + Email for B2B", "Instagram + TikTok for B2C", "Facebook + Website for local"],
    aiEnabled: false,
    module: "campaigns",
  },
];

// ==================== KEYWORDS ====================
export const keywordFieldGuides: FieldGuide[] = [
  {
    fieldId: "keyword",
    title: "Monitoring Keyword",
    explanation: "A word or phrase the system scans for across channels to discover potential leads.",
    importance: "Keywords are the foundation of lead discovery. The right keywords surface high-intent conversations.",
    howToFind: "Think about what your ideal customer would say when looking for your service. Include pain points, product names, and buying signals.",
    examples: [
      "looking for web developer",
      "need marketing agency",
      "recommend CRM software",
      "best SEO tools 2026",
    ],
    aiEnabled: true,
    module: "keywords",
  },
];

// ==================== CRM / DEALS ====================
export const crmFieldGuides: FieldGuide[] = [
  {
    fieldId: "deal_title",
    title: "Deal Title",
    explanation: "A descriptive name for this sales opportunity.",
    importance: "Clear deal titles help your team quickly identify and prioritize opportunities in the pipeline.",
    howToFind: "Use the prospect's company name + project/service. Example: 'Acme Corp — Website Redesign'",
    examples: ["Acme Corp — SEO Package", "StartupXYZ — Full Stack Dev", "Local Gym — Social Media Management"],
    aiEnabled: false,
    module: "crm",
  },
  {
    fieldId: "deal_value",
    title: "Deal Value",
    explanation: "The estimated monetary value of this sales opportunity.",
    importance: "Enables pipeline revenue forecasting and helps prioritize high-value deals.",
    howToFind: "Use your standard pricing or the quoted amount from the proposal.",
    examples: ["$2,500 for starter package", "$10,000 for enterprise deal", "$500/month retainer"],
    aiEnabled: false,
    module: "crm",
  },
  {
    fieldId: "deal_contact_name",
    title: "Contact Name",
    explanation: "The primary person you're communicating with for this deal.",
    importance: "Personalizes AI-generated follow-ups and keeps communication history organized.",
    howToFind: "Use the name from your email thread, LinkedIn conversation, or meeting notes.",
    examples: ["John Smith", "Sarah Johnson", "Ahmed Al-Rashid"],
    aiEnabled: false,
    module: "crm",
  },
  {
    fieldId: "deal_priority",
    title: "Deal Priority",
    explanation: "How urgent or important this deal is relative to others.",
    importance: "Helps your team focus on the most impactful opportunities first.",
    howToFind: "Consider deal value, closing timeline, and strategic importance.",
    examples: ["High: Large deal closing this week", "Medium: Standard pipeline deal", "Low: Early-stage exploration"],
    aiEnabled: false,
    module: "crm",
  },
];

// ==================== CHANNELS / INTEGRATIONS ====================
export const channelFieldGuides: FieldGuide[] = [
  {
    fieldId: "channel_name",
    title: "Channel Name",
    explanation: "A friendly name to identify this communication channel in your dashboard.",
    importance: "Helps distinguish between multiple channels of the same type (e.g., multiple Telegram groups).",
    howToFind: "Use a descriptive name like the group name, email address, or purpose.",
    examples: ["Main Telegram Group", "Support Email", "Website Live Chat", "Marketing WhatsApp"],
    aiEnabled: false,
    module: "channels",
  },
  {
    fieldId: "telegram_bot_token",
    title: "Telegram Bot Token",
    explanation: "The API token for your Telegram bot, used to send and receive messages.",
    importance: "Required to connect your Telegram bot for automated lead monitoring and replies.",
    howToFind: "Open Telegram → Search @BotFather → /newbot → Follow steps → Copy token.",
    examples: ["110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"],
    aiEnabled: false,
    module: "channels",
    validationHelp: "Token format: numbers:letters. Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    integrationLink: "https://t.me/BotFather",
  },
  {
    fieldId: "whatsapp_phone_id",
    title: "WhatsApp Phone Number ID",
    explanation: "The Phone Number ID from your WhatsApp Business API setup.",
    importance: "Required to send and receive WhatsApp messages through the platform.",
    howToFind: "Go to Meta Business Suite → WhatsApp → API Setup → Copy Phone Number ID.",
    examples: ["106540352242922"],
    aiEnabled: false,
    module: "channels",
    validationHelp: "Phone Number ID is a numeric string from Meta Business Suite.",
    integrationLink: "https://business.facebook.com/latest/whatsapp_manager/phone_numbers",
  },
  {
    fieldId: "email_address",
    title: "Email Address",
    explanation: "The email address used for receiving and sending business communications.",
    importance: "Enables email-based lead capture and automated reply capabilities.",
    howToFind: "Use your business email (e.g., info@company.com or sales@company.com).",
    examples: ["info@acmedigital.com", "sales@growthive.co", "support@techflow.io"],
    aiEnabled: false,
    module: "channels",
    validationHelp: "Must be a valid email format: name@domain.com",
  },
  {
    fieldId: "webhook_url",
    title: "Webhook URL",
    explanation: "A custom URL endpoint that receives incoming data from external services.",
    importance: "Enables integration with any external tool that supports webhook notifications.",
    howToFind: "Copy the webhook URL from your dashboard and paste it in your external service's webhook settings.",
    examples: ["https://api.example.com/webhooks/leads"],
    aiEnabled: false,
    module: "channels",
    validationHelp: "Must be a valid HTTPS URL.",
  },
];

// ==================== SOURCES ====================
export const sourceFieldGuides: FieldGuide[] = [
  {
    fieldId: "source_url",
    title: "Source URL",
    explanation: "The web address to monitor for lead-relevant content.",
    importance: "Sources are scanned regularly to discover conversations matching your keywords.",
    howToFind: "Add URLs of forums, communities, directories, or social pages where your audience is active.",
    examples: ["https://reddit.com/r/saas", "https://community.example.com", "https://forum.industry.com"],
    aiEnabled: false,
    module: "sources",
  },
  {
    fieldId: "source_name",
    title: "Source Name",
    explanation: "A friendly label for this monitoring source.",
    importance: "Makes it easy to identify where leads are coming from in your dashboard.",
    howToFind: "Use the platform or community name.",
    examples: ["Reddit SaaS", "Product Hunt", "Industry Forum", "LinkedIn Groups"],
    aiEnabled: false,
    module: "sources",
  },
];

// ==================== GLOBAL HELPERS ====================
export const allFieldGuides: FieldGuide[] = [
  ...businessProfileFieldGuides,
  ...competitorFieldGuides,
  ...campaignFieldGuides,
  ...keywordFieldGuides,
  ...crmFieldGuides,
  ...channelFieldGuides,
  ...sourceFieldGuides,
];

export const getFieldGuide = (guides: FieldGuide[], fieldId: string): FieldGuide | undefined => {
  return guides.find((g) => g.fieldId === fieldId);
};

export const getGuideByModule = (module: string): FieldGuide[] => {
  return allFieldGuides.filter((g) => g.module === module);
};

export const getGuideById = (fieldId: string): FieldGuide | undefined => {
  return allFieldGuides.find((g) => g.fieldId === fieldId);
};
