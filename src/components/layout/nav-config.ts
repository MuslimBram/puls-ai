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
  Wallet,
} from "lucide-react";
import type { RolePermissions } from "@/hooks/useRolePermissions";

export interface NavItem {
  href: string;
  label: string;
  icon: any;
  /** If set, user must have this permission to see the item */
  requiredPermission?: keyof RolePermissions;
  /** If set, only these roles can see the item */
  allowedRoles?: string[];
}

export interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
  adminOnly?: boolean;
  /** If set, user must have this permission to see the whole group */
  requiredPermission?: keyof RolePermissions;
  /** If set, only these roles see the group */
  allowedRoles?: string[];
}

export const businessNavGroups: NavGroup[] = [
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, requiredPermission: "canRespondInbox" },
      { href: "/leads", label: "Leads", icon: Target, requiredPermission: "canViewCRM" },
      { href: "/crm", label: "CRM", icon: Briefcase, requiredPermission: "canViewCRM" },
      { href: "/sales-engine", label: "Sales Engine", icon: Rocket, requiredPermission: "canViewCRM" },
      { href: "/revenue-engine", label: "Revenue Engine", icon: Banknote, requiredPermission: "canViewAnalytics" },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
    ],
  },
  {
    label: "Contact Center",
    icon: Headphones,
    requiredPermission: "canRespondInbox",
    items: [
      { href: "/telephony", label: "Telephony", icon: Phone },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
    ],
  },
  {
    label: "Growth & AI Core",
    icon: Sparkles,
    requiredPermission: "canConfigureAutomations",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/autonomous-ops", label: "Autonomous OS", icon: Cpu },
      { href: "/marketing-automation", label: "Marketing Auto", icon: Globe },
      { href: "/growth-strategy", label: "Growth Strategy", icon: TrendingUp },
      { href: "/market-expansion", label: "Market Expansion", icon: Globe },
      { href: "/ai-decisions", label: "AI Decisions", icon: Brain },
      { href: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
    ],
  },
  {
    label: "Optimization AI",
    icon: Gauge,
    requiredPermission: "canViewAnalytics",
    items: [
      { href: "/pricing-optimization", label: "Pricing & Offers", icon: Banknote },
      { href: "/personalization", label: "Personalization", icon: Fingerprint },
      { href: "/demand-forecasting", label: "Demand Forecast", icon: Activity },
      { href: "/workforce-optimization", label: "Workforce AI", icon: Gauge },
      { href: "/process-optimization", label: "Process AI", icon: Cpu },
      { href: "/funnel-optimization", label: "Funnel AI", icon: TrendingUp },
      { href: "/customer-value", label: "Customer Value", icon: Heart },
    ],
  },
  {
    label: "Intelligence",
    icon: Radar,
    requiredPermission: "canViewAnalytics",
    items: [
      { href: "/competitor-intelligence", label: "Competitor Intel", icon: Radar },
      { href: "/seo-audit", label: "SEO Audit", icon: Search },
      { href: "/brand-reputation", label: "Brand & Reputation", icon: Heart },
      { href: "/customer-experience", label: "Customer Experience", icon: Smile },
      { href: "/retention", label: "Retention", icon: ShieldCheckIcon },
      { href: "/keywords", label: "Keywords", icon: Key },
      { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
    ],
  },
  {
    label: "Engagement",
    icon: Users,
    requiredPermission: "canManageCampaigns",
    items: [
      { href: "/partnership-ecosystem", label: "Partnerships", icon: Handshake },
      { href: "/reengagement", label: "Re-Engagement", icon: RefreshCw },
      { href: "/growth-loop", label: "Growth Loop", icon: RefreshCw },
      { href: "/community", label: "Community", icon: Users },
      { href: "/lead-magnets", label: "Lead Magnets", icon: Target },
      { href: "/gamification", label: "Gamification", icon: FlaskConical },
      { href: "/media-studio", label: "Media Studio", icon: Megaphone },
      { href: "/broadcast", label: "Broadcast", icon: Send },
    ],
  },
  {
    label: "Integrations",
    icon: Plug,
    requiredPermission: "canConnectChannels",
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
      { href: "/branding", label: "Branding", icon: Paintbrush, requiredPermission: "canAccessBilling" },
      { href: "/financial-intelligence", label: "Financials", icon: Receipt, requiredPermission: "canAccessBilling" },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/subscription", label: "Billing", icon: CreditCard, requiredPermission: "canAccessBilling" },
      { href: "/credits", label: "Credits", icon: Banknote, requiredPermission: "canAccessBilling" },
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/reseller", label: "Reseller", icon: Store, requiredPermission: "canAccessBilling" },
      { href: "/ops-stability", label: "Ops Health", icon: Activity, requiredPermission: "canViewAnalytics" },
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
      { href: "/sources", label: "Sources & Scanner", icon: Search },
    ],
  },
];
