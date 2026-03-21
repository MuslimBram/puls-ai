import { useLocation } from "react-router-dom";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { TrialCountdown } from "@/components/TrialCountdown";
import { SoftphoneWidget } from "@/components/telephony/SoftphoneWidget";
import { AgentStatusBar } from "@/components/telephony/AgentStatusBar";
import { Menu } from "lucide-react";
import { businessNavGroups, adminNavGroups } from "./nav-config";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

export const DashboardHeader = ({ onMenuClick }: DashboardHeaderProps) => {
  const { isAdmin } = useRolePermissions();
  const location = useLocation();

  const allGroups = isAdmin ? [...adminNavGroups, ...businessNavGroups] : businessNavGroups;
  const allNavFlat = allGroups.flatMap((g) => g.items);
  const currentPageTitle = allNavFlat.find((i) => i.href === location.pathname)?.label || "Dashboard";

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={onMenuClick}>
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
  );
};
