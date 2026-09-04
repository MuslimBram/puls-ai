import { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { BrandingThemeProvider } from "@/components/BrandingThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ReferralIncentivePopup } from "@/components/ReferralIncentivePopup";
import { FloatingAIBot } from "@/components/FloatingAIBot";
import { OnboardingWelcomeModal } from "@/components/OnboardingWelcomeModal";
import { useRolePermissions } from "@/hooks/useRolePermissions";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const wasMobileOpen = useRef(false);
  const { i18n } = useTranslation();
  const location = useLocation();
  const { roles } = useRolePermissions();
  const isSq = (i18n.resolvedLanguage ?? i18n.language).startsWith("sq");
  const isRegularPlatformAdmin = roles.includes("admin") && !roles.includes("super_admin");
  const isAdminPage = location.pathname === "/admin";

  useEffect(() => {
    if (wasMobileOpen.current && !mobileOpen) {
      document.getElementById("dashboard-mobile-menu-trigger")?.focus();
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className={isAdminPage && isRegularPlatformAdmin ? "platform-admin-page flex min-h-screen bg-background" : "flex min-h-screen bg-background"}>
      {isAdminPage && isRegularPlatformAdmin && (
        <style>{`
          .platform-admin-page [role="tab"]:nth-child(2) {
            display: none !important;
          }
        `}</style>
      )}

      <BrandingThemeProvider />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={isSq ? "Mbyll menunë" : "Close menu"}
        />
      )}

      <div className="flex flex-1 flex-col">
        <DashboardHeader
          mobileOpen={mobileOpen}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <ReferralIncentivePopup />
      <FloatingAIBot />
      <OnboardingWelcomeModal />
    </div>
  );
};