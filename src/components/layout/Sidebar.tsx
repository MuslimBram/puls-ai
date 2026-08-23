import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { X, LogOut, ChevronDown, Crown, Search } from "lucide-react";
import {
  getNavGroupsForRoles,
  type NavGroup,
  type NavItem,
} from "./nav-config";
import { APP_VERSION } from "@/config/version";

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

// Etiketa e rolit të shfaqur te header i sidebar-it
function getRoleLabel(roles: string[]): { label: string; color: string } {
  if (roles.includes("super_admin"))
    return { label: "Owner", color: "text-amber-500" };
  if (roles.includes("admin"))
    return { label: "Admin", color: "text-violet-500" };
  if (roles.includes("freelancer"))
    return { label: "Freelancer", color: "text-blue-500" };
  if (roles.includes("ambassador"))
    return { label: "Ambassador", color: "text-green-500" };
  if (roles.includes("agent"))
    return { label: "Agent", color: "text-sky-500" };
  if (roles.includes("business_manager"))
    return { label: "Manager", color: "text-indigo-500" };
  if (roles.includes("business_owner"))
    return { label: "Business", color: "text-primary" };
  return { label: "User", color: "text-muted-foreground" };
}

export const Sidebar = ({ mobileOpen, onClose }: SidebarProps) => {
  const { signOut, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { isSuperAdmin, permissions, roles, isLoading } =
    useRolePermissions();
  const location = useLocation();

  const roleInfo = getRoleLabel(roles);
  const [navQuery, setNavQuery] = useState("");

  // Filtro items bazuar në permissions
  const filterItems = (items: NavItem[]): NavItem[] =>
    items.filter((item) => {
      if (
        item.requiredPermission &&
        !permissions[item.requiredPermission]
      )
        return false;
      if (
        item.allowedRoles &&
        !item.allowedRoles.some((r) => roles.includes(r as any))
      )
        return false;
      return true;
    });

  // Filtro groups bazuar në permissions
  const filterGroups = (groups: NavGroup[]): NavGroup[] =>
    groups
      .map((group) => {
        if (
          group.requiredPermission &&
          !permissions[group.requiredPermission]
        )
          return null;
        if (
          group.allowedRoles &&
          !group.allowedRoles.some((r) => roles.includes(r as any))
        )
          return null;
        const filteredItems = filterItems(group.items);
        if (filteredItems.length === 0) return null;
        return { ...group, items: filteredItems };
      })
      .filter(Boolean) as NavGroup[];

  // Zgjedh nav-groups sipas roleve
  const permissionFilteredGroups: NavGroup[] = isLoading
    ? []
    : filterGroups(getNavGroupsForRoles(roles));

  const normalizedQuery = navQuery.trim().toLocaleLowerCase();
  const allGroups: NavGroup[] = (normalizedQuery
    ? permissionFilteredGroups.map((group) => ({
        ...group,
        defaultOpen: true,
        items: group.items.filter(
          (item) =>
            item.label.toLocaleLowerCase().includes(normalizedQuery) ||
            group.label.toLocaleLowerCase().includes(normalizedQuery),
        ),
      }))
    : permissionFilteredGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.searchOnly),
      }))
  ).filter((group) => group.items.length > 0);

  const itemMatches = (href: string): boolean => {
    const [path, query] = href.split("?");
    if (location.pathname !== path) return false;
    if (!query) return true;
    const want = new URLSearchParams(query);
    const have = new URLSearchParams(location.search);
    for (const [k, v] of want.entries()) {
      if (have.get(k) !== v) return false;
    }
    return true;
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Logo + emri produktit */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <img
          src="/pwa/icon-64.png"
          alt="Pulse AI"
          className="h-7 w-7 rounded-lg"
        />
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold text-foreground">
              Pulse AI
            </span>
            <span className="text-[9px] text-muted-foreground">
              v{APP_VERSION}
            </span>
          </div>
          {/* Roli aktual */}
          <div className="flex items-center gap-1">
            {roles.includes("super_admin") && (
              <Crown className="h-2.5 w-2.5 text-amber-500" />
            )}
            <span className={cn("text-[10px] font-medium", roleInfo.color)}>
              {roleInfo.label}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Workspace Switcher (vetëm për jo-owner) */}
      {!isSuperAdmin && workspaces.length > 1 && (
        <div className="border-b border-border p-2">
          <Select
            value={workspace?.id ?? ""}
            onValueChange={switchWorkspace}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Zgjedh workspace" />
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

      {/* Search only within destinations already allowed for this role. */}
      {!isLoading && (
        <div className="border-b border-border p-2">
          <label className="relative block">
            <span className="sr-only">Kërko në menu</span>
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder="Kërko në menu..."
              aria-label="Kërko në menu"
              className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Navigimi */}
      {!isLoading && (
        <nav className="flex-1 overflow-y-auto p-2 space-y-px">
          {allGroups.map((group) => {
            const isGroupActive = group.items.some((item) =>
              itemMatches(item.href),
            );
            return (
              <Collapsible
                key={group.label}
                defaultOpen={group.defaultOpen || isGroupActive}
              >
                <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                  <group.icon className="h-3 w-3 shrink-0" />
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
                          itemMatches(item.href)
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge === "live" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        )}
                        {item.badge && item.badge !== "live" && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {normalizedQuery && allGroups.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nuk u gjet asnjë faqe.
            </p>
          )}
        </nav>
      )}

      {/* Footer: email + sign out */}
      <div className="border-t border-border p-2">
        <div className="mb-1 truncate px-2 text-[11px] text-muted-foreground">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground h-7 text-xs"
          onClick={signOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          Dil
        </Button>
      </div>
    </aside>
  );
};
