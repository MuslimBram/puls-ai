import { useLocation, useNavigate } from "react-router-dom";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { TrialCountdown } from "@/components/TrialCountdown";
import { SoftphoneWidget } from "@/components/telephony/SoftphoneWidget";
import { AgentStatusBar } from "@/components/telephony/AgentStatusBar";
import { Menu, ArrowLeft, ArrowRight, Home } from "lucide-react";
import { getNavGroupsForRoles } from "./nav-config";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

export const DashboardHeader = ({ onMenuClick }: DashboardHeaderProps) => {
  const { roles } = useRolePermissions();
  const location = useLocation();
  const navigate = useNavigate();

  const allNavFlat = getNavGroupsForRoles(roles).flatMap((group) => group.items);
  const currentPageTitle =
    allNavFlat.find((item) => {
      const [path, query] = item.href.split("?");
      if (path !== location.pathname) return false;
      if (!query) return true;

      const expected = new URLSearchParams(query);
      const current = new URLSearchParams(location.search);
      return Array.from(expected.entries()).every(
        ([key, value]) => current.get(key) === value,
      );
    })?.label || "Pulse AI";

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Navigation cluster — sits next to Translate / language area on the left */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(1)}
          aria-label="Go forward"
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/dashboard")}
          aria-label="Home"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Button>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

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
