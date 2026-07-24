import {
  LayoutDashboard,
  Inbox,
  Target,
  Briefcase,
  Rocket,
  Megaphone,
  BarChart3,
  Sparkles,
  Radar,
  Brain,
  Headphones,
  Workflow,
  Plug,
  Building2,
  CreditCard,
  ShieldCheck,
  Users,
  PieChart,
  Wallet,
  HelpCircle,
  Radio,
  Link2,
  Banknote,
  Store,
  Handshake,
  Shield,
  Activity,
  CalendarDays,
  Globe,
  Search,
  Phone,
  Send,
  Wand2,
  ImageIcon,
  Video,
  FileText,
  Library,
  Package,
  Lightbulb,
  MessageSquare,
  TrendingUp,
  Heart,
  Key,
  BookOpen,
  RefreshCw,
  Receipt,
  Paintbrush,
  Code,
  Zap,
} from "lucide-react";
import type { RolePermissions } from "@/hooks/useRolePermissions";

export interface NavItem {
  href: string;
  label: string;
  icon: any;
  requiredPermission?: keyof RolePermissions;
  allowedRoles?: string[];
  badge?: string;
}

export interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
  adminOnly?: boolean;
  requiredPermission?: keyof RolePermissions;
  allowedRoles?: string[];
}

// ============================================================
// OWNER / SUPER_ADMIN — Shikon GJITHÇKA + panel pronarit
// ============================================================
export const ownerNavGroups: NavGroup[] = [
  {
    label: "Owner Panel",
    icon: ShieldCheck,
    defaultOpen: true,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
      { href: "/admin/activation", label: "Activation", icon: Activity },
      { href: "/deep-analytics", label: "Full Analytics", icon: PieChart },
      { href: "/saas-health", label: "SaaS Health", icon: Brain },
      { href: "/admin/integration-hub", label: "Integration Hub", icon: Plug },
    ],
  },
  {
    label: "All Businesses",
    icon: Building2,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/managed-businesses", label: "Businesses", icon: Users },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/crm", label: "CRM", icon: Briefcase },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/revenue-engine", label: "Revenue Engine", icon: Banknote },
    ],
  },
  {
    label: "Platform",
    icon: Rocket,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/subscription", label: "Plans & Billing", icon: CreditCard },
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/reseller", label: "Resellers", icon: Store },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/system-status", label: "System Status", icon: Activity },
      { href: "/security", label: "Security", icon: Shield },
    ],
  },
];

// ============================================================
// ADMIN — Panel i plotë pa Owner controls
// ============================================================
export const adminNavGroups: NavGroup[] = [
  {
    label: "Admin",
    icon: ShieldCheck,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
      { href: "/admin/activation", label: "Activation", icon: Activity },
      { href: "/admin/integration-hub", label: "Integration Hub", icon: Plug },
      { href: "/deep-analytics", label: "Deep Analytics", icon: PieChart },
      { href: "/saas-health", label: "SaaS Health", icon: Brain },
    ],
  },
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, requiredPermission: "canRespondInbox" },
      { href: "/leads", label: "Leads", icon: Target, requiredPermission: "canViewCRM" },
      { href: "/crm", label: "CRM", icon: Briefcase, requiredPermission: "canViewCRM" },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
    ],
  },
  {
    label: "Businesses & Billing",
    icon: Building2,
    items: [
      { href: "/managed-businesses", label: "Businesses", icon: Users },
      { href: "/subscription", label: "Billing", icon: CreditCard },
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/security", label: "Security", icon: Shield },
    ],
  },
];

// ============================================================
// BUSINESS OWNER — Fokus biznesi + AI tools
// ============================================================
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
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
    ],
  },
  {
    label: "Content Studio",
    icon: Sparkles,
    requiredPermission: "canManageCampaigns",
    items: [
      { href: "/media-studio?tab=generate", label: "Create Content", icon: Wand2 },
      { href: "/media-studio?tab=generate&type=image", label: "AI Images", icon: ImageIcon },
      { href: "/media-studio?tab=generate&type=video", label: "AI Video", icon: Video },
      { href: "/content-calendar?tab=posts", label: "AI Posts", icon: FileText },
      { href: "/media-studio?tab=gallery", label: "Gallery", icon: Library },
      { href: "/content-calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business Scanner",
    icon: Radar,
    requiredPermission: "canViewAnalytics",
    items: [
      { href: "/sources?type=website", label: "Website", icon: Globe },
      { href: "/sources?type=product", label: "Products", icon: Package },
      { href: "/sources?type=social", label: "Social Networks", icon: Radio },
      { href: "/seo-audit", label: "SEO Analysis", icon: Search },
      { href: "/competitor-intelligence", label: "Competitors", icon: Radar },
    ],
  },
  {
    label: "AI Advisor",
    icon: Brain,
    requiredPermission: "canConfigureAutomations",
    items: [
      { href: "/ai-decisions?focus=posts", label: "Suggested Posts", icon: FileText },
      { href: "/ai-decisions?focus=offers", label: "Suggested Offers", icon: Lightbulb },
      { href: "/ai-decisions?focus=replies", label: "Suggested Replies", icon: MessageSquare },
      { href: "/ai-decisions?focus=campaigns", label: "Suggested Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Automations",
    icon: Workflow,
    requiredPermission: "canConfigureAutomations",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/broadcast", label: "Broadcast", icon: Send },
      { href: "/telephony", label: "Telephony", icon: Phone },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
    ],
  },
  {
    label: "Integrations",
    icon: Plug,
    requiredPermission: "canConnectChannels",
    items: [
      { href: "/connections", label: "Connections", icon: Plug },
      { href: "/channels", label: "Channels", icon: Radio },
      { href: "/connected-accounts", label: "Accounts", icon: Link2 },
    ],
  },
  {
    label: "Business & Billing",
    icon: Building2,
    items: [
      { href: "/business-profile", label: "Business Profile", icon: Building2 },
      { href: "/branding", label: "Branding", icon: Paintbrush, requiredPermission: "canAccessBilling" },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/subscription", label: "Subscription", icon: CreditCard, requiredPermission: "canAccessBilling" },
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/security", label: "Security", icon: Shield },
      { href: "/help-center", label: "Help", icon: HelpCircle },
    ],
  },
];

// ============================================================
// FREELANCER — Client management + AI tools
// ============================================================
export const freelancerNavGroups: NavGroup[] = [
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/crm", label: "CRM", icon: Briefcase },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Content Studio",
    icon: Sparkles,
    items: [
      { href: "/media-studio?tab=generate", label: "Create Content", icon: Wand2 },
      { href: "/media-studio?tab=generate&type=image", label: "AI Images", icon: ImageIcon },
      { href: "/content-calendar?tab=posts", label: "AI Posts", icon: FileText },
      { href: "/content-calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business Scanner",
    icon: Radar,
    items: [
      { href: "/sources?type=website", label: "Website", icon: Globe },
      { href: "/sources?type=social", label: "Social Networks", icon: Radio },
      { href: "/competitor-intelligence", label: "Competitors", icon: Radar },
    ],
  },
  {
    label: "My Clients",
    icon: Users,
    items: [
      { href: "/managed-businesses", label: "My Businesses", icon: Building2 },
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/connections", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "Account",
    icon: Wallet,
    items: [
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/partner", label: "Partner", icon: Handshake },
      { href: "/subscription", label: "Subscription", icon: CreditCard },
      { href: "/security", label: "Security", icon: Shield },
      { href: "/help-center", label: "Help", icon: HelpCircle },
    ],
  },
];

// ============================================================
// AGENT — Inbox + tasks
// ============================================================
export const agentNavGroups: NavGroup[] = [
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, badge: "live" },
      { href: "/crm", label: "Contacts", icon: Briefcase },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
      { href: "/telephony", label: "Telephony", icon: Phone },
    ],
  },
  {
    label: "Account",
    icon: Shield,
    items: [
      { href: "/security", label: "Security", icon: Shield },
      { href: "/help-center", label: "Help", icon: HelpCircle },
    ],
  },
];

// ============================================================
// AMBASSADOR — Referrals + wallet
// ============================================================
export const ambassadorNavGroups: NavGroup[] = [
  {
    label: "Main",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/partner", label: "Partner Program", icon: Handshake },
      { href: "/wallet", label: "Wallet & Earnings", icon: Wallet },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    icon: Shield,
    items: [
      { href: "/subscription", label: "Subscription", icon: CreditCard },
      { href: "/security", label: "Security", icon: Shield },
      { href: "/help-center", label: "Help", icon: HelpCircle },
    ],
  },
];

// ============================================================
// HELPER: Zgjedh nav-groups sipas roleve
// ============================================================
export function getNavGroupsForRoles(roles: string[]): NavGroup[] {
  if (roles.includes("super_admin")) return [...ownerNavGroups];
  if (roles.includes("admin")) return [...adminNavGroups];
  if (roles.includes("freelancer")) return [...freelancerNavGroups];
  if (roles.includes("agent") || roles.includes("business_manager")) return [...agentNavGroups];
  if (roles.includes("ambassador")) return [...ambassadorNavGroups];
  if (roles.includes("business_owner") || roles.includes("partner")) return [...businessNavGroups];
  // Default: business
  return [...businessNavGroups];
}
