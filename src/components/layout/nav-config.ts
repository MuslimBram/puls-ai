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
      { href: "/admin/activation", label: "Aktivizimi", icon: Activity },
      { href: "/deep-analytics", label: "Analytics i Plotë", icon: PieChart },
      { href: "/saas-health", label: "Shëndeti SaaS", icon: Brain },
      { href: "/admin/integration-hub", label: "Hub Integrimi", icon: Plug },
    ],
  },
  {
    label: "Të Gjitha Bizneset",
    icon: Building2,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/managed-businesses", label: "Bizneset", icon: Users },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/crm", label: "CRM", icon: Briefcase },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/revenue-engine", label: "Revenue Engine", icon: Banknote },
    ],
  },
  {
    label: "Platforma",
    icon: Rocket,
    allowedRoles: ["super_admin"],
    items: [
      { href: "/subscription", label: "Planet & Billing", icon: CreditCard },
      { href: "/partner", label: "Partnerët", icon: Handshake },
      { href: "/reseller", label: "Reseller-ët", icon: Store },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/system-status", label: "Statusi Sistemit", icon: Activity },
      { href: "/security", label: "Siguria", icon: Shield },
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
      { href: "/admin/activation", label: "Aktivizimi", icon: Activity },
      { href: "/admin/integration-hub", label: "Hub Integrimi", icon: Plug },
      { href: "/deep-analytics", label: "Analytics i Thellë", icon: PieChart },
      { href: "/saas-health", label: "Shëndeti SaaS", icon: Brain },
    ],
  },
  {
    label: "Kryesor",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, requiredPermission: "canRespondInbox" },
      { href: "/leads", label: "Leads", icon: Target, requiredPermission: "canViewCRM" },
      { href: "/crm", label: "CRM", icon: Briefcase, requiredPermission: "canViewCRM" },
      { href: "/campaigns", label: "Kampanji", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
    ],
  },
  {
    label: "Bizneset & Billing",
    icon: Building2,
    items: [
      { href: "/managed-businesses", label: "Bizneset", icon: Users },
      { href: "/subscription", label: "Billing", icon: CreditCard },
      { href: "/partner", label: "Partnerët", icon: Handshake },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/security", label: "Siguria", icon: Shield },
    ],
  },
];

// ============================================================
// BUSINESS OWNER — Fokus biznesi + AI tools
// ============================================================
export const businessNavGroups: NavGroup[] = [
  {
    label: "Kryesor",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, requiredPermission: "canRespondInbox" },
      { href: "/leads", label: "Leads", icon: Target, requiredPermission: "canViewCRM" },
      { href: "/crm", label: "CRM", icon: Briefcase, requiredPermission: "canViewCRM" },
      { href: "/sales-engine", label: "Sales Engine", icon: Rocket, requiredPermission: "canViewCRM" },
      { href: "/campaigns", label: "Kampanji", icon: Megaphone, requiredPermission: "canManageCampaigns" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, requiredPermission: "canViewAnalytics" },
    ],
  },
  {
    label: "Content Studio",
    icon: Sparkles,
    requiredPermission: "canManageCampaigns",
    items: [
      { href: "/media-studio?tab=generate", label: "Krijo Përmbajtje", icon: Wand2 },
      { href: "/media-studio?tab=generate&type=image", label: "Imazhe AI", icon: ImageIcon },
      { href: "/media-studio?tab=generate&type=video", label: "Video AI", icon: Video },
      { href: "/content-calendar?tab=posts", label: "Postime AI", icon: FileText },
      { href: "/media-studio?tab=gallery", label: "Galeria", icon: Library },
      { href: "/content-calendar", label: "Kalendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business Scanner",
    icon: Radar,
    requiredPermission: "canViewAnalytics",
    items: [
      { href: "/sources?type=website", label: "Website", icon: Globe },
      { href: "/sources?type=product", label: "Produktet", icon: Package },
      { href: "/sources?type=social", label: "Rrjetet Sociale", icon: Radio },
      { href: "/seo-audit", label: "SEO Analiza", icon: Search },
      { href: "/competitor-intelligence", label: "Konkurrenca", icon: Radar },
    ],
  },
  {
    label: "Këshilltar AI",
    icon: Brain,
    requiredPermission: "canConfigureAutomations",
    items: [
      { href: "/ai-decisions?focus=posts", label: "Postime të Sugjeruara", icon: FileText },
      { href: "/ai-decisions?focus=offers", label: "Oferta të Sugjeruara", icon: Lightbulb },
      { href: "/ai-decisions?focus=replies", label: "Përgjigje të Sugjeruara", icon: MessageSquare },
      { href: "/ai-decisions?focus=campaigns", label: "Kampanji të Sugjeruara", icon: Megaphone },
    ],
  },
  {
    label: "Automatizimet",
    icon: Workflow,
    requiredPermission: "canConfigureAutomations",
    items: [
      { href: "/automations", label: "Automatizimet", icon: Workflow },
      { href: "/broadcast", label: "Broadcast", icon: Send },
      { href: "/telephony", label: "Telefonia", icon: Phone },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
    ],
  },
  {
    label: "Integrimi",
    icon: Plug,
    requiredPermission: "canConnectChannels",
    items: [
      { href: "/connections", label: "Lidhjet", icon: Plug },
      { href: "/channels", label: "Kanalet", icon: Radio },
      { href: "/connected-accounts", label: "Llogaritë", icon: Link2 },
    ],
  },
  {
    label: "Biznesi & Billing",
    icon: Building2,
    items: [
      { href: "/business-profile", label: "Profili Biznesit", icon: Building2 },
      { href: "/branding", label: "Branding", icon: Paintbrush, requiredPermission: "canAccessBilling" },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/subscription", label: "Abonimi", icon: CreditCard, requiredPermission: "canAccessBilling" },
      { href: "/partner", label: "Partnerë", icon: Handshake },
      { href: "/security", label: "Siguria", icon: Shield },
      { href: "/help-center", label: "Ndihmë", icon: HelpCircle },
    ],
  },
];

// ============================================================
// FREELANCER — Menaxhim klientësh + AI tools
// ============================================================
export const freelancerNavGroups: NavGroup[] = [
  {
    label: "Kryesor",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/crm", label: "CRM", icon: Briefcase },
      { href: "/campaigns", label: "Kampanji", icon: Megaphone },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Content Studio",
    icon: Sparkles,
    items: [
      { href: "/media-studio?tab=generate", label: "Krijo Përmbajtje", icon: Wand2 },
      { href: "/media-studio?tab=generate&type=image", label: "Imazhe AI", icon: ImageIcon },
      { href: "/content-calendar?tab=posts", label: "Postime AI", icon: FileText },
      { href: "/content-calendar", label: "Kalendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business Scanner",
    icon: Radar,
    items: [
      { href: "/sources?type=website", label: "Website", icon: Globe },
      { href: "/sources?type=social", label: "Rrjetet Sociale", icon: Radio },
      { href: "/competitor-intelligence", label: "Konkurrenca", icon: Radar },
    ],
  },
  {
    label: "Klientët e Mi",
    icon: Users,
    items: [
      { href: "/managed-businesses", label: "Bizneset e Mia", icon: Building2 },
      { href: "/automations", label: "Automatizimet", icon: Workflow },
      { href: "/connections", label: "Integrimi", icon: Plug },
    ],
  },
  {
    label: "Llogaria",
    icon: Wallet,
    items: [
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/partner", label: "Partner", icon: Handshake },
      { href: "/subscription", label: "Abonimi", icon: CreditCard },
      { href: "/security", label: "Siguria", icon: Shield },
      { href: "/help-center", label: "Ndihmë", icon: HelpCircle },
    ],
  },
];

// ============================================================
// AGENT / BASHKËPUNËTOR — Inbox + detyra
// ============================================================
export const agentNavGroups: NavGroup[] = [
  {
    label: "Kryesor",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, badge: "live" },
      { href: "/crm", label: "Kontaktet", icon: Briefcase },
      { href: "/helpdesk", label: "Helpdesk", icon: Headphones },
      { href: "/telephony", label: "Telefonia", icon: Phone },
    ],
  },
  {
    label: "Llogaria",
    icon: Shield,
    items: [
      { href: "/security", label: "Siguria", icon: Shield },
      { href: "/help-center", label: "Ndihmë", icon: HelpCircle },
    ],
  },
];

// ============================================================
// AMBASSADOR — Referime + wallet
// ============================================================
export const ambassadorNavGroups: NavGroup[] = [
  {
    label: "Kryesor",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/partner", label: "Programi Partner", icon: Handshake },
      { href: "/wallet", label: "Wallet & Fitime", icon: Wallet },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Llogaria",
    icon: Shield,
    items: [
      { href: "/subscription", label: "Abonimi", icon: CreditCard },
      { href: "/security", label: "Siguria", icon: Shield },
      { href: "/help-center", label: "Ndihmë", icon: HelpCircle },
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
