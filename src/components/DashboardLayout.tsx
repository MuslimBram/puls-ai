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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/reply-workspace", label: "Reply Workspace", icon: MessageSquare },
  { href: "/keywords", label: "Keywords", icon: Key },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/dedicated-ai", label: "AI i Dedikuar", icon: Bot },
  { href: "/content-calendar", label: "Content Calendar", icon: CalendarDays },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/competitor-intelligence", label: "Competitor Intel", icon: Search },
  { href: "/connected-accounts", label: "Connected Accounts", icon: Link2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/business-profile", label: "Business Profile", icon: Building2 },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
  { href: "/pricing", label: "Pricing", icon: Zap },
];

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  const onInactivityWarning = useCallback(() => {
    setShowInactivityWarning(true);
  }, []);

  useInactivityLogout(onInactivityWarning);

  const allNav = isAdmin
    ? [...navItems, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : navItems;

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

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {allNav.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
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
            {allNav.find((i) => i.href === location.pathname)?.label || "Dashboard"}
          </h2>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Inactivity Warning */}
      <Dialog open={showInactivityWarning} onOpenChange={setShowInactivityWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session Expiring</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your session will expire in 2 minutes due to inactivity. Move your mouse or press a key to stay signed in.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowInactivityWarning(false)}>Stay Signed In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
