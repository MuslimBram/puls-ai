import {
  LayoutDashboard,
  Building2,
  Zap,
  Target,
  Key,
  Radio,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Inbox,
  Link2,
  Bot,
  Radar,
  CalendarDays,
  BookOpen,
  Megaphone,
  Search,
  Handshake,
  Shield,
  Briefcase,
  Brain,
  Headphones,
  Workflow,
  Send,
  Phone,
  Users,
  PieChart,
  Sparkles,
  Plug,
  Receipt,
  Paintbrush,
  Package,
  Code,
  Rocket,
  Globe,
  Cpu,
  Banknote,
  Store,
  TrendingUp,
  Heart,
  Smile,
  ShieldCheck as ShieldCheckIcon,
  FlaskConical,
  RefreshCw,
  Fingerprint,
  Activity,
  Gauge,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: any;
}

export interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
  adminOnly?: boolean;
}

export const businessNavGroups: NavGroup[] = [
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/crm", label: "CRM", icon: Briefcase },
      { href: "/sales-engine", label: "Sales Engine", icon: Rocket },
      { href: "/revenue-engine", label: "Revenue Engine", icon: Banknote },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Contact Center",
    icon: Headphones,
    items: [
      { href: "/telephony", label: "Telephony", icon: Phone },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
    ],
  },
  {
    label: "Growth & AI",
    icon: Sparkles,
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/autonomous-ops", label: "Autonomous OS", icon: Cpu },
      { href: "/marketing-automation", label: "Marketing", icon: Globe },
      { href: "/growth-strategy", label: "Growth Strategy", icon: TrendingUp },
      { href: "/market-expansion", label: "Market Expansion", icon: Globe },
      { href: "/pricing-optimization", label: "Pricing AI", icon: Banknote },
      { href: "/competitive-intelligence-engine", label: "Competitive Intel", icon: Radar },
      { href: "/brand-reputation", label: "Brand & Reputation", icon: Heart },
      { href: "/customer-experience", label: "Customer Experience", icon: Smile },
      { href: "/retention", label: "Retention", icon: ShieldCheckIcon },
      { href: "/partnership-ecosystem", label: "Partnerships", icon: Handshake },
      { href: "/reengagement", label: "Re-Engagement", icon: RefreshCw },
      { href: "/personalization", label: "Personalization", icon: Fingerprint },
      { href: "/demand-forecasting", label: "Demand Forecast", icon: Activity },
      { href: "/workforce-optimization", label: "Workforce AI", icon: Gauge },
      { href: "/process-optimization", label: "Process AI", icon: Cpu },
      { href: "/funnel-optimization", label: "Funnel AI", icon: TrendingUp },
      { href: "/offer-optimization", label: "Offer AI", icon: Banknote },
      { href: "/customer-value", label: "Customer Value", icon: Heart },
      { href: "/ai-decisions", label: "AI Decisions", icon: Brain },
      { href: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
      { href: "/growth-loop", label: "Growth Loop", icon: RefreshCw },
      { href: "/community", label: "Community", icon: Users },
      { href: "/lead-magnets", label: "Lead Magnets", icon: Target },
      { href: "/gamification", label: "Gamification", icon: FlaskConical },
      { href: "/keywords", label: "Keywords", icon: Key },
      { href: "/competitor-intelligence", label: "Competitor Intel", icon: Search },
      { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
      { href: "/media-studio", label: "Media Studio", icon: Megaphone },
      { href: "/broadcast", label: "Broadcast", icon: Send },
    ],
  },
  {
    label: "Integrations",
    icon: Plug,
    items: [
      { href: "/connections", label: "Connections Hub", icon: Plug },
      { href: "/channels", label: "Channels", icon: Radio },
      { href: "/connected-accounts", label: "Accounts", icon: Link2 },
      { href: "/public-api", label: "Public API", icon: Zap },
      { href: "/marketplace", label: "Marketplace", icon: Package },
      { href: "/developer", label: "Developer", icon: Code },
    ],
  },
  {
    label: "Business & Billing",
    icon: Receipt,
    items: [
      { href: "/business-profile", label: "Business Profile", icon: Building2 },
      { href: "/branding", label: "Branding", icon: Paintbrush },
      { href: "/financial-intelligence", label: "Financials", icon: Receipt },
      { href: "/subscription", label: "Billing", icon: CreditCard },
      { href: "/credits", label: "Credits", icon: Banknote },
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/reseller", label: "Reseller", icon: Store },
      { href: "/ops-stability", label: "Ops Health", icon: Activity },
      { href: "/security", label: "Security", icon: Shield },
    ],
  },
];

export const adminNavGroups: NavGroup[] = [
  {
    label: "Admin",
    icon: ShieldCheck,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
      { href: "/deep-analytics", label: "Analytics", icon: PieChart },
      { href: "/saas-health", label: "SaaS Health", icon: Brain },
    ],
  },
];
