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
  searchOnly?: boolean;
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
// ADMINISTRATION — isolated from ordinary business navigation
// ============================================================
export const ownerNavGroups: NavGroup[] = [
  {
    label: "Administration",
    icon: ShieldCheck,
    defaultOpen: true,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
      { href: "/admin/lidhjet", label: "Lidhjet Moderation", icon: Shield },
      { href: "/admin/activation", label: "Activation", icon: Activity },
      { href: "/admin/integration-hub", label: "Integration Hub", icon: Plug },
      { href: "/deep-analytics", label: "Deep Analytics", icon: PieChart },
      { href: "/saas-health", label: "SaaS Health", icon: Brain },
      { href: "/system-status", label: "System Status", icon: Activity },
    ],
  },
];

export const adminNavGroups: NavGroup[] = [
  {
    label: "Administration",
    icon: ShieldCheck,
    defaultOpen: true,
    adminOnly: true,
    allowedRoles: ["admin", "super_admin"],
    items: [
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
      { href: "/admin/lidhjet", label: "Lidhjet Moderation", icon: Shield },
      { href: "/admin/activation", label: "Activation", icon: Activity },
      { href: "/admin/integration-hub", label: "Integration Hub", icon: Plug },
      { href: "/deep-analytics", label: "Deep Analytics", icon: PieChart },
      { href: "/saas-health", label: "SaaS Health", icon: Brain },
      { href: "/system-status", label: "System Status", icon: Activity },
    ],
  },
];

// ============================================================
// BUSINESS — compact hubs; deeper tools remain available inside each hub
// ============================================================
export const businessNavGroups: NavGroup[] = [
  {
    label: "Core",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, requiredPermission: "canRespondInbox" },
      { href: "/leads", label: "Leads", icon: Target, requiredPermission: "canViewCRM" },
      { href: "/crm", label: "CRM", icon: Briefcase, requiredPermission: "canViewCRM" },
      { href: "/lidhjet", label: "Lidhjet", icon: Globe, badge: "FREE" },
    ],
  },
  {
    label: "Growth",
    icon: TrendingUp,
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/media-studio", label: "Content Studio", icon: Sparkles, requiredPermission: "canManageCampaigns" },
      { href: "/sources", label: "Business Scanner", icon: Radar, requiredPermission: "canViewAnalytics" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
      { href: "/media-studio?tab=generate&type=image", label: "AI Images", icon: ImageIcon, requiredPermission: "canManageCampaigns", searchOnly: true },
      { href: "/media-studio?tab=generate&type=video", label: "AI Video", icon: Video, requiredPermission: "canManageCampaigns", searchOnly: true },
      { href: "/media-studio?tab=gallery", label: "Gallery", icon: Library, requiredPermission: "canManageCampaigns", searchOnly: true },
      { href: "/content-calendar", label: "Content Calendar", icon: CalendarDays, requiredPermission: "canManageCampaigns", searchOnly: true },
      { href: "/seo-audit", label: "SEO Analysis", icon: Search, requiredPermission: "canViewAnalytics", searchOnly: true },
      { href: "/competitor-intelligence", label: "Competitors", icon: Radar, requiredPermission: "canViewAnalytics", searchOnly: true },
    ],
  },
  {
    label: "Automation",
    icon: Workflow,
    items: [
      { href: "/automations", label: "Automations", icon: Workflow, requiredPermission: "canConfigureAutomations" },
      { href: "/ai-decisions", label: "AI Advisor", icon: Brain, requiredPermission: "canConfigureAutomations" },
      { href: "/sales-engine", label: "Sales Engine", icon: Rocket, requiredPermission: "canViewCRM" },
      { href: "/revenue-engine", label: "Revenue Engine", icon: Banknote, requiredPermission: "canViewAnalytics" },
      { href: "/telephony", label: "Telephony", icon: Phone, requiredPermission: "canConnectChannels" },
      { href: "/broadcast", label: "Broadcast", icon: Send, requiredPermission: "canConfigureAutomations", searchOnly: true },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones, searchOnly: true },
      { href: "/ai-marketplace", label: "AI Marketplace", icon: Zap, requiredPermission: "canConfigureAutomations", searchOnly: true },
      { href: "/ai-training", label: "AI Training Center", icon: Brain, requiredPermission: "canConfigureAutomations", searchOnly: true },
      { href: "/integration-wizard", label: "Integration Wizard", icon: Plug, requiredPermission: "canConfigureAutomations", searchOnly: true },
    ],
  },
  {
    label: "Business",
    icon: Building2,
    items: [
      { href: "/managed-businesses", label: "Businesses", icon: Users },
      { href: "/connections", label: "Connections", icon: Plug, requiredPermission: "canConnectChannels" },
      { href: "/channels", label: "Channels", icon: Radio, requiredPermission: "canConnectChannels", searchOnly: true },
      { href: "/connected-accounts", label: "Connected Accounts", icon: Link2, requiredPermission: "canConnectChannels", searchOnly: true },
      { href: "/subscription", label: "Billing", icon: CreditCard, requiredPermission: "canAccessBilling" },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/partner", label: "Partners", icon: Handshake },
    ],
  },
  {
    label: "Settings",
    icon: Shield,
    items: [
      { href: "/business-profile", label: "Business Profile", icon: Building2 },
      { href: "/branding", label: "Branding", icon: Paintbrush, requiredPermission: "canAccessBilling" },
      { href: "/session-security", label: "Security", icon: Shield },
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
      { href: "/lidhjet", label: "Lidhjet", icon: Globe, badge: "FREE" },
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
      { href: "/session-security", label: "Security", icon: Shield },
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
      { href: "/lidhjet", label: "Lidhjet", icon: Globe, badge: "FREE" },
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
      { href: "/session-security", label: "Security", icon: Shield },
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
      { href: "/lidhjet", label: "Lidhjet", icon: Globe, badge: "FREE" },
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
      { href: "/session-security", label: "Security", icon: Shield },
      { href: "/help-center", label: "Help", icon: HelpCircle },
    ],
  },
];

// ============================================================
// HELPER: Zgjedh nav-groups sipas roleve
// ============================================================
function mergeGroups(...sets: NavGroup[][]): NavGroup[] {
  const merged: NavGroup[] = [];
  const seenDestinations = new Set<string>();

  for (const group of sets.flat()) {
    const uniqueItems = group.items.filter((item) => {
      if (seenDestinations.has(item.href)) return false;
      seenDestinations.add(item.href);
      return true;
    });

    if (uniqueItems.length === 0) continue;

    const existing = merged.find((candidate) => candidate.label === group.label);
    if (!existing) {
      merged.push({ ...group, items: uniqueItems });
      continue;
    }

    existing.items.push(...uniqueItems);
  }

  return merged;
}

export function getNavGroupsForRoles(roles: string[]): NavGroup[] {
  // Platform owner sees the Owner Panel plus every business/admin area.
  if (roles.includes("super_admin"))
    return mergeGroups(ownerNavGroups, adminNavGroups, businessNavGroups);
  if (roles.includes("admin"))
    return mergeGroups(adminNavGroups, businessNavGroups);
  if (roles.includes("freelancer")) return [...freelancerNavGroups];
  if (roles.includes("agent") || roles.includes("business_manager")) return [...agentNavGroups];
  if (roles.includes("ambassador")) return [...ambassadorNavGroups];
  if (roles.includes("business_owner") || roles.includes("partner")) return [...businessNavGroups];
  // Default: business
  return [...businessNavGroups];
}

