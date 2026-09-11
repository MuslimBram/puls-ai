export default {
  // Common
  common: {
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    search: "Search",
    filter: "Filter",
    back: "Back",
    forward: "Forward",
    home: "Home",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    next: "Next",
    submit: "Submit",
    confirm: "Confirm",
    close: "Close",
    yes: "Yes",
    no: "No",
    or: "or",
    error: "Error",
    success: "Success",
    warning: "Warning",
    noData: "No data available",
    actions: "Actions",
    status: "Status",
    date: "Date",
    name: "Name",
    email: "Email",
    phone: "Phone",
    description: "Description",
    type: "Type",
    active: "Active",
    inactive: "Inactive",
    all: "All",
    none: "None",
    refresh: "Refresh",
    export: "Export",
    import: "Import",
    settings: "Settings",
    profile: "Profile",
    dashboard: "Dashboard",
    logout: "Log Out",
    language: "Language",
  },

  // Auth
  auth: {
    signIn: "Sign In",
    signUp: "Sign Up",
    signOut: "Sign Out",
    login: "Log In",
    register: "Register",
    forgotPassword: "Forgot Password?",
    resetPassword: "Reset Password",
    email: "Email",
    password: "Password",
    fullName: "Full Name",
    enterCredentials: "Enter your credentials to sign in",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    continueWithGoogle: "Continue with Google",
    emailPlaceholder: "email@example.com",
    passwordPlaceholder: "••••••••",
    namePlaceholder: "First Last",
    passwordMinLength: "Password must be at least 6 characters",
    checkEmailConfirm: "Check your email to confirm your account",
    registrationFailed: "Registration failed. Try again.",
    accountType: "Account Type",
    accountTypeRequired: "Select an account type",
    business: "Business",
    businessDesc: "I have a company",
    freelancer: "Freelancer",
    freelancerDesc: "I work independently",
    billingPlan: "Billing Plan",
    billingPlanRequired: "Select a billing plan",
    createAccount: "Create Account",
    analyzingCreating: "Analyzing & creating account...",
    companyName: "Company Name",
    companyPlaceholder: "Your business name",
    free: "Free",
  },

  // 2FA
  twoFA: {
    title: "Two-Factor Verification",
    chooseMethod: "Choose verification method",
    googleAuth: "Google Authenticator",
    googleAuthDesc: "Use the Authenticator app on your phone",
    recommended: "Recommended · More secure",
    emailCode: "Email Code",
    emailCodeDesc: "Send a 6-digit code to your email",
    lessSafe: "Less secure",
    cancel: "Cancel",
    setupAuth: "Setup Google Authenticator",
    scanQR: "Scan the QR code with Google Authenticator app or enter the manual code",
    manualCode: "Manual code:",
    enterCode: "Enter the 6-digit code from Authenticator",
    verifyActivate: "Verify & Activate",
    verifying: "Verifying...",
    backToMethods: "← Back to methods",
    securityVerification: "Security Verification",
    codeSentTo: "We sent a 6-digit code to",
    enterAuthCode: "Enter the 6-digit code from Google Authenticator app",
    emailCodeLabel: "Code from Email",
    authCodeLabel: "Code from Authenticator",
    resendCode: "Resend code",
    sending: "Sending...",
    verifyLogin: "Verify & Sign In",
    emailWarning: "Email code is less secure than Google Authenticator. We recommend using Authenticator for maximum security.",
    codeSent: "Code was sent to your email",
    emailNotSent: "Email was not sent. Check email configuration.",
    wrongCode: "Wrong code",
    verificationSuccess: "Verification successful!",
    verificationError: "Verification error",
    enrollError: "Error during Authenticator setup",
    authCheckError: "Error checking Authenticator",
    codeSendFailed: "Code sending failed",
    newCodeSent: "New code sent to email",
  },

  // Landing
  landing: {
    aiPowered: "AI-Powered Lead Discovery",
    heroTitle: "Turn Every Conversation Into a Business Opportunity",
    heroDesc: "Monitor channels, detect intent with AI, and respond instantly. All from one unified platform.",
    startTrial: "Start Free Trial",
    viewPricing: "View Pricing",
    noCreditCard: "No credit card required · 7-day free trial",
    problemBadge: "The Problem",
    problemTitle: "Leads Slip Through the Cracks",
    problems: {
      scattered: "Scattered conversations across channels",
      slow: "Slow response times lose deals",
      noVisibility: "No visibility into lead quality or intent",
      manual: "Manual follow-ups don't scale",
    },
    solutionBadge: "The Solution",
    solutionTitle: "One Platform. Full Control.",
    solutions: {
      unified: "Unified inbox for all channels",
      aiScores: "AI analyzes and scores every lead",
      automated: "Automated responses in your brand voice",
      crm: "CRM pipeline tracks every deal",
    },
    featuresTitle: "Everything You Need to Grow",
    featuresDesc: "Built for businesses that want to capture, qualify, and convert leads faster.",
    features: {
      unifiedInbox: "Unified Inbox",
      unifiedInboxDesc: "Telegram, Email, WhatsApp, Website Chat — all in one place.",
      dedicatedAI: "Dedicated AI",
      dedicatedAIDesc: "AI that knows your business and responds to customers automatically.",
      smartAnalytics: "Smart Analytics",
      smartAnalyticsDesc: "Track lead quality, response times, and conversion rates.",
      leadDiscovery: "Lead Discovery",
      leadDiscoveryDesc: "AI monitors channels and discovers potential leads for you.",
      crmPipeline: "CRM Pipeline",
      crmPipelineDesc: "Full deal pipeline with stages, tasks, and activity tracking.",
      competitorIntel: "Competitor Intel",
      competitorIntelDesc: "Monitor competitors and get strategic positioning insights.",
      campaignBuilder: "Campaign Builder",
      campaignBuilderDesc: "AI-generated marketing campaigns with content strategy.",
      callTracking: "Call Tracking",
      callTrackingDesc: "Log calls, get AI summaries, and track follow-ups.",
      automationEngine: "Automation Engine",
      automationEngineDesc: "Trigger workflows on lead events, messages, and more.",
    },
    opportunitiesTitle: "Four Ways Pulse AI Powers Your Growth",
    opportunitiesDesc: "Choose your focus. Watch your business transform.",
    pricingTitle: "Live Pricing From the Product Catalog",
    pricingDesc: "Plans, labels, and pricing stay aligned with the backend.",
    recommended: "Recommended",
    custom: "Custom",
    comparePlans: "Compare Plans",
    testimonialsTitle: "Trusted by Growing Businesses",
    testimonialsDesc: "See what our customers say.",
    testimonials: [
      { name: "Sarah K.", role: "Marketing Director", quote: "Pulse AI transformed how we handle inbound leads. Response times dropped by 80%." },
      { name: "Michael R.", role: "Agency Owner", quote: "The AI assistant feels like a team member. It handles initial conversations perfectly." },
      { name: "Elena T.", role: "Sales Manager", quote: "We discovered 3x more qualified leads within the first month of using the platform." },
    ],
    communityTitle: "Join Our Community of Successful Business Owners",
    communityDesc: "Thousands of businesses and freelancers growing together.",
    ctaTitle: "Ready to Capture More Leads?",
    ctaDesc: "Join businesses using Pulse AI to discover, qualify, and convert leads with AI.",
    signIn: "Sign In",
    getStarted: "Get Started",
    pricing: "Pricing",
    allRightsReserved: "All rights reserved.",
    footer: {
      privacy: "Privacy",
      terms: "Terms",
      cookies: "Cookies",
      security: "Security",
      contact: "Contact",
      tagline: "The AI Business Operating System",
    },
    howItWorks: {
      title: "How It Works",
      desc: "Get started in 4 simple steps",
      steps: {
        register: { title: "Sign Up", desc: "Create your account — choose Business, Freelancer, or Ambassador" },
        profile: { title: "Set Up Profile", desc: "Add your business info, logo, and contact details" },
        channels: { title: "Connect Channels", desc: "Link WhatsApp, Telegram, Email or Website Chat" },
        aiWorks: { title: "AI Works for You", desc: "AI learns your business and handles conversations automatically" },
      },
    },
    faq: {
      title: "Frequently Asked Questions",
      desc: "Everything you need to know before getting started",
      items: {
        whatIsPulse: {
          q: "What is Pulse AI?",
          a: "Pulse AI is an all-in-one AI-powered platform for managing leads, customers, marketing, and sales. It unifies your inbox, CRM, telephony, and automation into one dashboard.",
        },
        howMuch: {
          q: "How much does it cost?",
          a: "Plans start at 9,900 ALL/month (Start), 19,900 ALL/month (Growth), 39,900 ALL/month (Pro), and 79,900 ALL/month (Enterprise). You get discounts for longer commitments: 5% for 3 months, 10% for 6 months, 15% yearly.",
        },
        freeTrial: {
          q: "Can I try it for free?",
          a: "Yes! Every account gets a 7-day free trial with full access to all features. No credit card required.",
        },
        rolesDifference: {
          q: "What's the difference between Business, Freelancer, Ambassador, and White-Label?",
          a: "Business: manages its own business and workspace. Freelancer: manages independent work and, when authorized, client businesses. Ambassador: focuses on referrals. White-Label: is for agencies or resellers using their own brand and domain after commercial setup. Any commission or benefit depends on active account terms and configuration.",
        },
        referralEarnings: {
          q: "How do I earn money with referrals?",
          a: "Ordinary referrals and partner commissions are separate mechanisms. Any payout or commission uses the active account rate and terms; Pulse AI does not promise a fixed public percentage or lifetime commission.",
        },
        installMobile: {
          q: "Can I install it on my phone?",
          a: "Yes! Pulse AI is a PWA (Progressive Web App). You can install it on iOS, Android, desktop, and tablet — just like a native app, directly from your browser.",
        },
        afterTrial: {
          q: "What happens after the free trial?",
          a: "After 7 days, you need to select a plan and pay to continue. If no payment is made within 30 days of registration, your account is automatically deleted. You can pay using PayPal, Payoneer, or your referral earnings wallet balance.",
        },
      },
    },
  },

  homepage: {
    seo: {
      title: "Pulse AI — The AI Business Operating System",
      description:
        "One intelligent system to run, automate and grow your business across conversations, CRM, AI, automation and analytics.",
    },
    hero: {
      eyebrow: "Business Operating System",
      brand: "Pulse AI",
      title: "The AI Business Operating System",
      subtitle: "One intelligent system to run, automate and grow your business.",
      description:
        "Pulse AI connects customer conversations, CRM, AI, automation and business intelligence into one operating system your team can actually use.",
      primaryCta: "Get Started",
      secondaryCta: "Try Pulse AI",
      supportingNote:
        "Start your account, explore the platform, or ask Pulse AI about the workflow that fits your business.",
    },
    systemPreview: {
      title: "One connected system",
      description: "Channels, context, actions and analytics move together.",
      badge: "Unified",
    },
    problem: {
      eyebrow: "The business problem",
      title: "Most businesses still run on fragmented conversations and disconnected tools.",
      description:
        "Leads arrive everywhere, follow-ups slow down, context disappears and reporting never reflects the full picture.",
      solutionLabel: "Why Pulse AI",
      solution:
        "Pulse AI becomes the operating layer between your channels, your team and your customer data so every conversation can move toward revenue.",
      items: {
        fragmentedLeads: "Leads arrive across multiple channels with no single operating view.",
        missedFollowUps: "Follow-ups depend on memory, inbox switching and manual reminders.",
        disconnectedData: "CRM records, notes and conversation history live in separate places.",
        manualWork: "Teams repeat the same qualification, routing and update work every day.",
        unclearIntelligence: "Decision-makers struggle to see what is working and where revenue is leaking.",
        lostContext: "Customer context gets lost between messages, calls, handoffs and deals.",
      },
    },
    flowSection: {
      eyebrow: "How Pulse AI works",
      title: "A single operating flow instead of scattered features.",
      description:
        "Channels feed a shared inbox, customer context stays in the CRM, Pulse AI recommends or automates the next action, and analytics keep the business aligned.",
    },
    flow: {
      channels: {
        title: "Channels",
        description: "Bring customer conversations from the channels your business already uses.",
      },
      inbox: {
        title: "Unified Inbox",
        description: "Capture new leads and manage inbound demand from one working surface.",
      },
      crm: {
        title: "CRM + Context",
        description: "Keep customer history, ownership and deal progress connected to every conversation.",
      },
      ai: {
        title: "Pulse AI",
        description: "Use AI assistance to understand intent, surface context and guide next actions.",
      },
      automation: {
        title: "Automation / Next Action",
        description: "Trigger follow-ups, handoffs and operational workflows without losing control.",
      },
      analytics: {
        title: "Analytics / Revenue Intelligence",
        description: "See pipeline, response performance and business signals in one view.",
      },
    },
    pillars: {
      eyebrow: "Core capability pillars",
      title: "Built as one business system.",
      description:
        "Pulse AI groups the core operating layers a business needs without turning the homepage into a directory of unrelated tools.",
      items: {
        communication: {
          title: "Unified Customer Communication",
          description: "Keep inbound conversations, lead capture and team response in one place.",
        },
        intelligence: {
          title: "AI Assistant & Intelligence",
          description: "Use AI to understand customer intent, support teams and reduce repetitive work.",
        },
        crmSales: {
          title: "CRM & Sales",
          description: "Track relationships, deal progress and the next commercial step with better context.",
        },
        automation: {
          title: "Automation",
          description: "Turn operating rules into repeatable follow-ups, routing and internal actions.",
        },
        memory: {
          title: "Business Memory",
          description: "Retain customer and business context so conversations do not restart from zero.",
        },
        analytics: {
          title: "Analytics & CEO Intelligence",
          description: "Translate daily activity into visibility on growth, bottlenecks and revenue outcomes.",
        },
      },
    },
    omnichannel: {
      eyebrow: "Omnichannel",
      title: "Meet customers where conversations already happen.",
      description:
        "Pulse AI is designed around multi-channel communication so customer context can stay connected as businesses grow.",
      disclaimer:
        "Channel availability depends on the connected accounts and workspace configuration that are enabled in your setup.",
    },
    aiSection: {
      eyebrow: "Live interaction",
      title: "Ask Pulse AI about the platform.",
      description:
        "The existing public AI assistant stays available on the page so visitors can explore capabilities in a direct, low-friction way.",
      note:
        "Use it for product questions, fit checks and workflow exploration. The AI Help button stays available at the bottom of the page.",
      primaryCta: "Open AI Help",
      cardTitle: "Try these prompts",
      promptOne: "How does Pulse AI connect conversations, CRM and automation?",
      promptTwo: "What customer journey can Pulse AI support for a service business?",
      promptThree: "Which channels and capabilities should I explore first?",
    },
    journey: {
      eyebrow: "Customer journey",
      title: "Move from lead to action without losing momentum.",
      description:
        "Pulse AI supports the operational path from initial conversation through qualification, follow-up and reporting.",
      steps: {
        lead: {
          title: "Lead",
          description: "Capture inbound demand from your active communication channels.",
        },
        qualification: {
          title: "Qualification",
          description: "Understand intent, quality and urgency faster with structured context.",
        },
        crm: {
          title: "CRM",
          description: "Keep ownership, notes and customer history tied to the opportunity.",
        },
        followUp: {
          title: "Follow-up",
          description: "Support the next response, reminder or workflow with automation where appropriate.",
        },
        booking: {
          title: "Booking / Conversation",
          description: "Help the team move qualified interest into a booked step or active sales conversation.",
        },
        analytics: {
          title: "Analytics",
          description: "Measure what is happening across pipeline, response flow and revenue signals.",
        },
      },
    },
    control: {
      eyebrow: "Human control and trust",
      title: "Automation where it helps. Human control where it matters.",
      description:
        "Pulse AI is designed to assist teams, not remove operational visibility or business control.",
      items: {
        handoff: {
          title: "Human handoff",
          description: "Teams can step into conversations and customer workflows whenever human judgment is needed.",
        },
        rules: {
          title: "Business controls",
          description: "Use business rules, permissions and operational boundaries to decide how automation should behave.",
        },
        visibility: {
          title: "Operational visibility",
          description: "Keep a clearer view of customer activity, follow-up state and business performance from one system.",
        },
      },
    },
    pricing: {
      eyebrow: "Pricing",
      title: "See current plan details in the pricing experience.",
      description:
        "Pricing stays tied to the product source of truth. Explore plans on the pricing page instead of relying on homepage snapshots.",
      cta: "Go to Pricing",
    },
    finalCta: {
      eyebrow: "Final step",
      title: "Start with the right entry point for your business.",
      description:
        "Create your account, request a follow-up, or open the AI assistant to understand how Pulse AI fits your operating flow.",
      pointOne: "Create an account and enter the product safely through the existing sign-in flow.",
      pointTwo: "Leave your details if you want the team to follow up about your business setup.",
      pointThree: "Use the public AI assistant to explore the platform before you commit.",
      primaryCta: "Create Account",
      secondaryCta: "Explore with AI",
    },
    leadForm: {
      title: "Request a follow-up",
      subtitle: "Tell us about your business and we will get back to you.",
    },
  },

  // Billing plans
  billing: {
    trial: "7-Day Trial",
    trialDesc: "Free trial",
    trialPrice: "0 ALL",
    monthly: "Monthly",
    monthlyDesc: "No commitment",
    monthlyPrice: "9,900 ALL/mo",
    threeMonth: "3 Months",
    threeMonthDesc: "Save 5%",
    threeMonthPrice: "9,405 ALL/mo",
    sixMonth: "6 Months",
    sixMonthDesc: "Save 10%",
    sixMonthPrice: "8,910 ALL/mo",
    yearly: "Yearly",
    yearlyDesc: "Save 15%",
    yearlyPrice: "8,415 ALL/mo",
  },

  // Navigation
  nav: {
    dashboard: "Dashboard",
    inbox: "Inbox",
    leads: "Leads",
    crm: "CRM",
    campaigns: "Campaigns",
    analytics: "Analytics",
    keywords: "Keywords",
    automations: "Automations",
    competitors: "Competitor Intelligence",
    knowledgeBase: "Knowledge Base",
    mediaStudio: "Media Studio",
    broadcast: "Broadcast",
    helpdesk: "Helpdesk",
    telephony: "Telephony",
    channels: "Channels",
    connections: "Connections",
    businessProfile: "Business Profile",
    subscription: "Subscription",
    partner: "Partner",
    security: "Security",
    branding: "Branding",
    admin: "Admin",
    sources: "Sources",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    mobileMenu: "Mobile navigation",
    group: {
      platform: "Platform",
      business: "Business",
      company: "Company",
      more: "More",
    },
    platform: {
      aiIntelligence: "AI & Intelligence",
      unifiedInbox: "Unified Inbox",
      crmSales: "CRM & Sales",
      marketing: "Marketing",
      automation: "Automation",
      analytics: "Analytics",
      developers: "Developers",
    },
    standalone: {
      lidhjet: "Lidhjet",
      pricing: "Pricing",
      security: "Security",
    },
    business: {
      partners: "Partners",
      whiteLabel: "White Label",
      leah: "LEAH",
    },
    company: {
      about: "About",
      contact: "Contact",
    },
    growthSuite: {
      label: "Growth Suite",
    },
  },

  // Errors
  errors: {
    pageError: "Page Error",
    pageErrorDesc: "This page encountered an error. Try refreshing or navigating elsewhere.",
    clearCacheRefresh: "Clear cache & Refresh",
    goToDashboard: "Go to Dashboard",
    tryAgain: "Try Again",
  },

  // ─── Public website — Wave 1 ────────────────────────────────────────────────

  // Brand
  brand: {
    descriptor: "The AI Business Operating System",
    home: "Pulse AI — Home",
    positioning: "One intelligent system to run, automate and grow your business.",
  },

  // Public CTA labels
  cta: {
    getStarted: "Get Started",
    goToDashboard: "Go to Dashboard",
    requestBeta: "Request Beta Access",
    notifyMe: "Notify Me",
    learnMore: "Learn More",
    login: "Log In",
    backToHome: "Back to Home",
  },

  // Badges
  badge: {
    comingSoon: "Soon",
    beta: "Beta",
    new: "New",
  },

  // Breadcrumbs
  breadcrumbs: {
    label: "Breadcrumb",
  },

  // Coming Soon page
  comingSoon: {
    title: "Coming Soon",
    description:
      "We're working hard to bring this to you. Sign up to be notified when it launches.",
  },

  // Security page
  security: {
    title: "Built for Business Security",
    summary:
      "Pulse AI is designed with role-based access controls, encrypted data in transit, and session security.",
    eyebrow: "Our Controls",
    pointsTitle: "How we protect your business",
  },

  // Pricing page (neutral shell)
  pricing: {
    title: "Simple, Transparent Pricing",
    subtitle:
      "Start free, scale as you grow. Full pricing details are available inside your account.",
    neutralNotice:
      "Detailed plan pricing is displayed inside your account dashboard after sign-up, drawn live from our pricing settings.",
    signUpToSee: "Already have an account?",
    viewPlans: "View My Plans",
    faqTitle: "Pricing FAQ",
  },

  // Developers page
  developers: {
    title: "Developers",
    description:
      "Build on top of Pulse AI. Our API lets you integrate your existing tools, automate workflows, and extend the platform to fit your exact needs.",
    getApiAccess: "Get API Access",
    faqTitle: "Common Questions",
  },

  // Platform page shared strings
  platform: {
    capabilities: "Capabilities",
    whatYouGet: "What you get",
    status: {
      live: "Live",
      beta: "Beta",
      comingSoon: "Coming Soon",
    },
  },

  // Footer
  footer: {
    label: "Site footer",
    legal: "Legal",
    rightsReserved: "All rights reserved.",
    tagline: "One intelligent system to run, automate and grow your business.",
    links: {
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      cookies: "Cookie Policy",
      security: "Security",
      contact: "Contact",
      dpa: "DPA",
    },
  },

  leadForm: {
    fields: {
      fullName: "Full name",
      email: "Email",
      phone: "Phone",
      businessName: "Business name",
      interestedPlan: "Interested plan",
      teamSize: "Team size",
      message: "Message (optional)",
    },
    placeholders: {
      fullName: "Jane Doe",
      email: "you@company.com",
      phone: "+355 69 123 4567",
      businessName: "Acme Inc.",
      interestedPlan: "Choose a plan",
      teamSize: "How many people?",
      message: "What would you like to automate? What problem are you trying to solve?",
    },
    plans: {
      standard: "Standard",
      professional: "Professional",
      advanced: "Advanced",
      enterprise: "Enterprise",
    },
    teamSizes: {
      one: "Just me",
      twoToFive: "2–5 people",
      sixToFifteen: "6–15 people",
      sixteenToFifty: "16–50 people",
      fiftyPlus: "More than 50 people",
    },
    submit: "Send request",
    submitting: "Sending...",
    legalPrefix: "By clicking, you accept the",
    privacyPolicy: "Privacy Policy",
    success: {
      title: "Thanks! Your request has been received successfully.",
      description: "Our team can follow up using the details you submitted.",
    },
    errors: {
      required: "Name and email are required.",
      generic: "Something went wrong. Please try again.",
    },
  },
  /** /platform hub */
  platformHub: {
    seo: {
      title: "Platform — Pulse AI",
      desc:  "Explore the full Pulse AI platform: AI intelligence, unified inbox, CRM, marketing, automation, analytics, and more.",
    },
    hero: {
      title: "One Platform. Every Business Tool You Need.",
      desc:  "Pulse AI is the AI Business Operating System. One intelligent system to run, automate and grow your business.",
    },
    modules: {
      heading: "Explore the Platform",
      learnMore: "Learn more",
      learnMoreLabel: "Learn more about {{module}}",
      ai: {
        title: "AI & Intelligence",
        desc:  "AI-powered conversations, intent detection, and smart routing across every channel.",
      },
      "unified-inbox": {
        title: "Unified Inbox",
        desc:  "All your customer messages from WhatsApp, Instagram, Messenger, Telegram, Email, and more — in one place.",
      },
      crm: {
        title: "CRM & Sales",
        desc:  "Manage leads, contacts, pipelines, and deals with AI-assisted qualification.",
      },
      marketing: {
        title: "Marketing",
        desc:  "Campaigns, broadcasts, lead magnets, and content scheduling — all connected.",
      },
      automation: {
        title: "Automation",
        desc:  "Build powerful workflows that trigger across channels, CRM, and your business logic.",
      },
      analytics: {
        title: "Analytics",
        desc:  "Deep insights across channels, campaigns, team performance, and revenue.",
      },
      developers: {
        title: "Developers",
        desc:  "Public API, webhooks, and integrations to extend Pulse AI to your exact needs.",
      },
      partners: {
        title: "Partners",
        desc:  "Reseller and white-label partner programme for agencies and consultants.",
      },
      lidhjet: {
        title: "Lidhjet",
        desc:  "Community-driven connections and collaborative growth for Albanian-speaking businesses.",
      },
    },
    cta: {
      title: "Ready to get started?",
      desc:  "Join thousands of businesses already running on Pulse AI.",
    },
  },

  /** /platform/ai */
  platformAi: {
    seo: {
      title: "AI & Intelligence — Pulse AI Platform",
      desc:  "Pulse AI brings intelligent conversation management, intent detection, and AI-assisted routing to every business channel.",
    },
    hero: {
      title: "AI Intelligence Built for Business",
      desc:  "Detect intent, automate responses, and escalate to humans — intelligently.",
    },
    capabilities: {
      heading: "What AI does for your business",
      intentDetection: {
        title: "Intent Detection",
        desc:  "Understand what customers want before you respond.",
      },
      smartRouting: {
        title: "Smart Routing",
        desc:  "Route conversations to the right team or AI agent automatically.",
      },
      multiChannel: {
        title: "Multi-Channel AI",
        desc:  "One AI layer across WhatsApp, Instagram, Messenger, Telegram, Email, and Web Chat.",
      },
      humanHandoff: {
        title: "Human Handoff",
        desc:  "Seamlessly transfer to a human agent when needed, with full context.",
      },
    },
    cta: { title: "Start using AI today", desc: "Get started with AI-powered conversations." },
  },

  /** /platform/unified-inbox */
  platformInbox: {
    seo: {
      title: "Unified Inbox — Pulse AI Platform",
      desc:  "Manage all customer messages from every channel in one smart inbox.",
    },
    hero: {
      title: "One Inbox. Every Channel.",
      desc:  "WhatsApp, Instagram, Messenger, Telegram, SMS, Email, Voice, and Web Chat — unified.",
    },
    channels: {
      heading: "Supported channels",
    },
    cta: { title: "Try the Unified Inbox", desc: "Stop switching apps. Start from one place." },
  },

  /** /platform/crm */
  platformCrm: {
    seo: {
      title: "CRM & Sales — Pulse AI Platform",
      desc:  "AI-assisted CRM to manage leads, contacts, and deals from first contact to close.",
    },
    hero: {
      title: "CRM That Thinks With You",
      desc:  "Leads, contacts, pipelines, and deals — with AI qualification built in.",
    },
    features: {
      heading: "CRM capabilities",
      contacts: { title: "Contact Hub", desc: "Unified profiles with conversation history and channel data." },
      pipeline: { title: "Sales Pipeline", desc: "Visual kanban pipeline with automated stage moves." },
      qualification: { title: "AI Lead Qualification", desc: "Score and qualify leads before your team even responds." },
      followUp: { title: "Automated Follow-ups", desc: "Set rules, let AI handle the timing." },
    },
    cta: { title: "Start managing your leads", desc: "Connect your channels and let the CRM do the work." },
  },

  /** /platform/marketing */
  platformMarketing: {
    seo: {
      title: "Marketing — Pulse AI Platform",
      desc:  "Run campaigns, broadcasts, and lead generation — all from Pulse AI.",
    },
    hero: {
      title: "Marketing That Converts",
      desc:  "Broadcasts, campaigns, lead magnets — connected to your CRM and AI.",
    },
    features: {
      heading: "Marketing tools",
      broadcasts: { title: "Broadcast Messaging", desc: "Send targeted messages to segments across channels." },
      campaigns: { title: "Campaigns", desc: "Multi-step drip campaigns with smart timing." },
      leadMagnets: { title: "Lead Magnets", desc: "Capture leads from any channel with smart forms." },
      contentCalendar: { title: "Content Calendar", desc: "Plan and schedule content across your social channels." },
    },
    cta: { title: "Launch your first campaign", desc: "Start converting visitors into customers." },
  },

  /** /platform/automation */
  platformAutomation: {
    seo: {
      title: "Automation — Pulse AI Platform",
      desc:  "Build powerful automations across channels, CRM, and your business logic.",
    },
    hero: {
      title: "Automate Everything",
      desc:  "Trigger workflows from any channel event, CRM update, or AI signal.",
    },
    features: {
      heading: "Automation capabilities",
      triggers: { title: "Event Triggers", desc: "Start automations from channel messages, CRM changes, or time-based rules." },
      actions: { title: "Multi-Step Actions", desc: "Send messages, update CRM, notify teams, and more." },
      aiActions: { title: "AI-Powered Actions", desc: "Let AI decide the next best action based on context." },
      monitoring: { title: "Flow Monitoring", desc: "Track automation performance and identify drop-offs." },
    },
    cta: { title: "Build your first automation", desc: "Save hours every week with smart workflows." },
  },

  /** /platform/analytics */
  platformAnalytics: {
    seo: {
      title: "Analytics — Pulse AI Platform",
      desc:  "Deep insights across channels, campaigns, team performance, and revenue.",
    },
    hero: {
      title: "Data That Drives Decisions",
      desc:  "Understand what's working across every channel, campaign, and team.",
    },
    features: {
      heading: "Analytics modules",
      channel: { title: "Channel Analytics", desc: "Message volume, response times, and engagement by channel." },
      campaign: { title: "Campaign Performance", desc: "Open rates, click-throughs, and conversion by campaign." },
      team: { title: "Team Performance", desc: "Response times, resolution rates, and CSAT by agent." },
      revenue: { title: "Revenue Intelligence", desc: "Track deals closed, pipeline value, and revenue attribution." },
    },
    cta: { title: "Explore your data", desc: "Connect your channels and start seeing insights." },
  },

  /** /platform/developers */
  platformDevelopers: {
    seo: {
      title: "Developers — Pulse AI Platform",
      desc:  "Public API, webhooks, and SDK for building on top of Pulse AI.",
    },
    hero: {
      title: "Build on Pulse AI",
      desc:  "Our API lets you integrate your existing tools, automate workflows, and extend the platform.",
    },
    features: {
      heading: "Developer tools",
      api: { title: "Public REST API", desc: "Full programmatic access to messages, contacts, CRM, and automations." },
      webhooks: { title: "Webhooks", desc: "Real-time event delivery to your own systems." },
      sdk: { title: "SDK & Libraries", desc: "Official client libraries for popular languages." },
      docs: { title: "Documentation", desc: "Comprehensive API reference and integration guides." },
    },
    apiLink: "Explore the API docs",
    cta: { title: "Start building", desc: "Access the public API and connect your stack." },
  },

  /** /platform/partners */
  platformPartners: {
    seo: {
      title: "Partners — Pulse AI Platform",
      desc:  "Reseller and white-label partner programme for agencies and consultants.",
    },
    hero: {
      title: "Grow with Pulse AI",
      desc:  "Become a reseller, white-label partner, or integration partner.",
    },
    features: {
      heading: "Partner tiers",
      reseller: { title: "Reseller Partner", desc: "Sell Pulse AI to your clients with competitive margins." },
      whiteLabel: { title: "White-Label", desc: "Deploy Pulse AI under your own brand." },
      integration: { title: "Integration Partner", desc: "Build and list integrations in the Pulse AI marketplace." },
    },
    cta: { title: "Join the Partner Programme", desc: "Apply to become a Pulse AI partner." },
  },

  /** /platform/lidhjet */
  platformLidhjet: {
    seo: {
      title: "Lidhjet — Pulse AI Platform",
      desc:  "Community-driven connections and collaborative growth for Albanian-speaking businesses.",
    },
    hero: {
      title: "Lidhjet — Connect. Collaborate. Grow.",
      desc:  "Community-driven connections for Albanian-speaking businesses on Pulse AI.",
    },
    features: {
      heading: "Lidhjet features",
      feed: { title: "Community Feed", desc: "Share updates, insights, and wins with peers." },
      interests: { title: "Interest Groups", desc: "Connect around shared industries, topics, and goals." },
      collaboration: { title: "Collaboration", desc: "Find partners, co-founders, and collaborators." },
    },
    cta: { title: "Join Lidhjet", desc: "Connect with Albanian-speaking businesses on Pulse AI." },
  },

  // ── Wave 4 — Trust + Commercial ─────────────────────────────────────────────

  /** /security public page */
  securityPage: {
    seo: {
      title: "Security — Pulse AI",
      desc:  "How Pulse AI protects your workspace: encryption, role-based access, EU hosting, two-factor authentication, and audit logging.",
    },
    hero: {
      title:    "Security Overview",
      subtitle: "The controls Pulse AI uses to protect your workspace, your customers' data and your connected channels.",
    },
    pillars: {
      heading:    "Six security pillars",
      encryption: { title: "Encryption",          body: "TLS 1.2+ in transit, encryption at rest, and AES-256-GCM for stored integration credentials." },
      rls:        { title: "Row Level Security",   body: "Every workspace table is protected by database-level policies so data cannot cross workspaces." },
      auth:       { title: "Authentication",       body: "Mandatory email verification, optional TOTP two-factor, 24-hour session expiry and new-device approval." },
      hosting:    { title: "EU hosting",           body: "Production databases, storage and functions run in the European Union (Frankfurt region)." },
      audit:      { title: "Audit logging",        body: "Administrative actions, credential changes and webhook activity are recorded for review." },
      webhook:    { title: "Webhook integrity",    body: "Inbound webhooks are verified with HMAC-SHA256 signatures and per-tenant credentials." },
    },
    sections: {
      encryptionTitle:       "Encryption",
      encryptionBody:        "Traffic between your browser and Pulse AI uses TLS 1.2 or higher. Data at rest is encrypted by the managed database layer. API keys, OAuth tokens and channel credentials are encrypted with AES-256-GCM before storage and are never returned to the browser in plain text.",
      accessTitle:           "Access control",
      accessItems: {
        rbac:    "Role-based access: owner, admin, manager, agent and partner roles with distinct permissions.",
        server:  "Roles are stored in a dedicated table and validated server-side, never in the browser.",
        totp:    "Two-factor authentication (TOTP) is available for all accounts.",
        device:  "Logins from unrecognised devices require administrator approval.",
        session: "Sessions expire automatically after 24 hours of inactivity.",
      },
      hostingTitle:          "Hosting and location",
      hostingBody:           "Application data is hosted on managed EU infrastructure in Frankfurt, Germany. Serverless functions execute in the same region. Sub-processors are listed in the Privacy Policy and the Data Processing Agreement.",
      monitoringTitle:       "Monitoring and backups",
      monitoringBody:        "Automated database backups run daily with point-in-time recovery. Error rates, function failures and abnormal webhook traffic are monitored continuously, and rate limiting protects public endpoints from abuse.",
      sharedTitle:           "Shared responsibility",
      sharedWeDo:            "Platform hardening, encryption, database isolation, patching, monitoring and incident response for the Pulse AI infrastructure.",
      sharedYouDo:           "Use strong unique passwords, enable two-factor authentication, review who has access to your workspace, and revoke integrations you no longer use.",
      sharedDisclaimer:      "This page describes controls that are in place today. It is not a certification, and it does not claim absolute security; no online platform can offer that.",
      reportTitle:           "Reporting a vulnerability",
      reportBody:            "Email info@mso.re with the subject \"Security\" and include reproduction steps. We acknowledge reports within two business days and will keep you updated until the issue is resolved. Please do not publicly disclose an issue before we have had a chance to fix it.",
    },
  },

  /** /pricing public commercial presentation */
  pricingPage: {
    seo: {
      title: "Pricing — Pulse AI",
      desc:  "Simple, transparent pricing for Pulse AI. Start free, scale as you grow. Plans drawn live from our pricing settings.",
    },
    hero: {
      title:          "Simple, Transparent Pricing",
      subtitle:       "Start free, scale as you grow. Full pricing details are available inside your account.",
      neutralNotice:  "Detailed plan pricing is displayed inside your account after sign-up, drawn live from our pricing settings.",
    },
    trial:            "Every paid plan starts with a 7-day free trial.",
    planCount:        "Active plans",
    loadingPlans:     "Loading plans…",
    unavailable:      "Pricing data is currently unavailable. Sign in to view your plan options.",
    ctaLoggedOut:     "See Plans & Pricing",
    ctaLoggedIn:      "Manage Subscription",
    trialBadge:       "7-day free trial",
    canonicalSource:  "Prices are fetched live from our pricing settings. No prices are hard-coded on this page.",
  },

  /** /white-label public information page */
  whiteLabelPage: {
    seo: {
      title: "White Label — Pulse AI",
      desc:  "Sell Pulse AI under your own brand. Your logo, your domain, your pricing. We run the infrastructure, AI and updates.",
    },
    hero: {
      title:    "Sell Pulse AI Under Your Own Brand",
      subtitle: "Your logo, your domain, your pricing. We run the infrastructure, AI and updates — you own the client relationship and keep the margin.",
    },
    features: {
      branding:     { title: "Full branding",      body: "Logo, colours, emails and reports carry your identity." },
      domain:       { title: "Your own domain",    body: "Clients never see Pulse AI — they see your agency." },
      hosting:      { title: "We keep it running", body: "Hosting, security updates and bug fixes included." },
    },
    applyNote:    "Our team reviews every application before activation. Sign in or create an account to submit your application.",
    configNote:   "Branding configuration and reseller settings require an active white-label account.",
  },

  /** Trust architecture shared strings */
  trust: {
    dataControl:    "You control your workspace data",
    dataControlDesc:"Your data stays in your workspace. Row Level Security enforces tenant isolation at the database layer.",
    securityLink:   "Read our Security Overview",
    privacyLink:    "Privacy Policy",
    termsLink:      "Terms of Service",
    euHosting:      "EU-hosted (Frankfurt)",
    e2eEncryption:  "Encrypted in transit and at rest",
    rbac:           "Role-based access control",
  },

  /** Footer extensions (Wave 4) */
  footerWave4: {
    refund:           "Refund Policy",
    affiliateTerms:   "Ambassador Terms",
    termsAndPayments: "Payment Terms",
  },
} as const;
