import { ReactNode, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";
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
  CalendarDays,
  BookOpen,
  Megaphone,
  Search,
  Handshake,
  Shield,
  Briefcase,
  Brain,
  ChevronDown,
  Settings,
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
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Leads & Sales",
    icon: Target,
    defaultOpen: true,
    items: [
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/reply-workspace", label: "Reply Workspace", icon: MessageSquare },
      { href: "/crm", label: "Sales CRM", icon: Briefcase },
      { href: "/visitor-intelligence", label: "Visitor Intel", icon: Brain },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/content-calendar", label: "Content Calendar", icon: CalendarDays },
      { href: "/keywords", label: "Keywords", icon: Key },
      { href: "/competitor-intelligence", label: "Competitor Intel", icon: Search },
      { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
    ],
  },
  {
    label: "Channels & AI",
    icon: Radio,
    items: [
      { href: "/channels", label: "Channels", icon: Radio },
      { href: "/connected-accounts", label: "Connected Accounts", icon: Link2 },
      { href: "/dedicated-ai", label: "Dedicated AI", icon: Bot },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { href: "/business-profile", label: "Business Profile", icon: Building2 },
      { href: "/partner", label: "Partner Program", icon: Handshake },
      { href: "/security", label: "Security", icon: Shield },
      { href: "/subscription", label: "Subscription", icon: CreditCard },
      { href: "/pricing", label: "Pricing", icon: Zap },
    ],
  },
];

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useInactivityLogout();

  // Build groups, add admin to Settings if admin
  const allGroups = isAdmin
    ? navGroups.map((g) =>
        g.label === "Settings"
          ? { ...g, items: [...g.items, { href: "/admin", label: "Admin", icon: ShieldCheck }] }
          : g
      )
    : navGroups;

  // Flatten all items for header title lookup
  const allNavFlat = allGroups.flatMap((g) => g.items);

  // Determine current page title
  const currentPageTitle = allNavFlat.find((i) => i.href === location.pathname)?.label || "Dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">LeadPulse</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Workspace Switcher */}
        {workspaces.length > 0 && (
          <div className="border-b border-border p-3">
            <Select value={workspace?.id ?? ""} onValueChange={switchWorkspace}>
              <SelectTrigger className="h-8 text-xs">
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

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {allGroups.map((group) => {
            const isGroupActive = group.items.some((item) => location.pathname === item.href);
            return (
              <Collapsible
                key={group.label}
                defaultOpen={group.defaultOpen || isGroupActive}
              >
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <group.icon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-2 space-y-0.5 border-l border-border/50 pl-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          location.pathname === item.href
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {currentPageTitle}
          </h2>
          <div className="ml-auto">
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
