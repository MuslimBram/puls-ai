import { ReactNode, useState } from "react";
import { BrandingThemeProvider } from "@/components/BrandingThemeProvider";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";
import { TrialCountdown } from "@/components/TrialCountdown";
import { SoftphoneWidget } from "@/components/telephony/SoftphoneWidget";
import { AgentStatusBar } from "@/components/telephony/AgentStatusBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  Building2,
  Zap,
  LogOut,
  Menu,
  X,
  Target,
  Key,
  Radio,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Inbox,
  MessageSquare,
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
  ChevronDown,
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
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
  adminOnly?: boolean;
}

const businessNavGroups: NavGroup[] = [
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
      { href: "/partner", label: "Partners", icon: Handshake },
      { href: "/security", label: "Security", icon: Shield },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
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

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { isAdmin } = useRolePermissions();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Use branding for sidebar logo (inline import to avoid circular deps)
  const brandingData = workspace ? undefined : undefined; // Will be applied via BrandingThemeProvider

  // Admin sees admin groups + business groups; regular users see only business
  const allGroups = isAdmin ? [...adminNavGroups, ...businessNavGroups] : businessNavGroups;

  const allNavFlat = allGroups.flatMap((g) => g.items);
  const currentPageTitle = allNavFlat.find((i) => i.href === location.pathname)?.label || "Dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      <BrandingThemeProvider />
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-base font-bold text-foreground">Pulse AI</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden h-7 w-7"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Workspace Switcher — hidden for admins */}
        {!isAdmin && workspaces.length > 0 && (
          <div className="border-b border-border p-2">
            <Select value={workspace?.id ?? ""} onValueChange={switchWorkspace}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id} className="text-xs">
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-2 space-y-px">
          {allGroups.map((group) => {
            const isGroupActive = group.items.some((item) => location.pathname === item.href);
            return (
              <Collapsible key={group.label} defaultOpen={group.defaultOpen || isGroupActive}>
                <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                  <group.icon className="h-3 w-3" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-1.5 space-y-px border-l border-border/40 pl-1.5">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium transition-colors",
                          location.pathname === item.href
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <div className="mb-1 truncate px-2 text-[11px] text-muted-foreground">{user?.email}</div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground h-7 text-xs"
            onClick={signOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-border px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-base font-semibold text-foreground">{currentPageTitle}</h2>
          <div className="hidden md:flex ml-4">
            <AgentStatusBar />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <TrialCountdown />
            <SoftphoneWidget />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
