import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { getNavLabel } from "./nav-labels";

interface DashboardHeaderProps {
  mobileOpen: boolean;
  onMenuClick: () => void;
}

export const DashboardHeader = ({
  mobileOpen,
  onMenuClick,
}: DashboardHeaderProps) => {
  const { roles } = useRolePermissions();
  const { i18n } = useTranslation();
  const location = useLocation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isSq = language.startsWith("sq");
  const navigate = useNavigate();

  const allNavFlat = getNavGroupsForRoles(roles).flatMap((group) => group.items);
  const matchingItems = allNavFlat
    .filter((item) => {
      const [path, query] = item.href.split("?");
      if (path !== location.pathname) return false;
      if (!query) return true;

      const expected = new URLSearchParams(query);
      const current = new URLSearchParams(location.search);
      return Array.from(expected.entries()).every(
        ([key, value]) => current.get(key) === value,
      );
    })
    .sort((left, right) => {
      const leftSpecificity = left.href.split("?")[1]?.split("&").length ?? 0;
      const rightSpecificity = right.href.split("?")[1]?.split("&").length ?? 0;
      return rightSpecificity - leftSpecificity;
    });
  const currentPageTitle = matchingItems[0]?.label || "Pulse AI";
  const localizedPageTitle = getNavLabel(
    currentPageTitle,
    language,
  );

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-7 w-7"
        onClick={onMenuClick}
        aria-label={isSq ? "Hap menunë" : "Open menu"}
        aria-controls="dashboard-sidebar"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Navigation cluster — sits next to Translate / language area on the left */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(-1)}
          aria-label={isSq ? "Kthehu prapa" : "Go back"}
          title={isSq ? "Prapa" : "Back"}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(1)}
          aria-label={isSq ? "Shko përpara" : "Go forward"}
          title={isSq ? "Përpara" : "Forward"}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/dashboard")}
          aria-label={isSq ? "Kryefaqja" : "Home"}
          title={isSq ? "Kryefaqja" : "Home"}
        >
          <Home className="h-4 w-4" />
        </Button>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <h2 className="text-base font-semibold text-foreground">{localizedPageTitle}</h2>
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
