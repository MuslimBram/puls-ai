import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Zap, X, LogOut, ChevronDown } from "lucide-react";
import { businessNavGroups, adminNavGroups, type NavGroup } from "./nav-config";

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ mobileOpen, onClose }: SidebarProps) => {
  const { signOut, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { isAdmin } = useRolePermissions();
  const location = useLocation();

  const allGroups: NavGroup[] = isAdmin ? [...adminNavGroups, ...businessNavGroups] : businessNavGroups;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <img src="/pwa/icon-64.png" alt="Pulse AI" className="h-7 w-7 rounded-lg" />
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-foreground">Pulse AI</span>
          <span className="text-[9px] text-muted-foreground">v1.0</span>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto lg:hidden h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Workspace Switcher */}
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

      {/* Navigation */}
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
                      onClick={onClose}
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

      {/* Footer */}
      <div className="border-t border-border p-2">
        <div className="mb-1 truncate px-2 text-[11px] text-muted-foreground">{user?.email}</div>
        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground h-7 text-xs" onClick={signOut}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </aside>
  );
};
