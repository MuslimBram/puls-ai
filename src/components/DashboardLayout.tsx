import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandingThemeProvider } from "@/components/BrandingThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ReferralIncentivePopup } from "@/components/ReferralIncentivePopup";
import { FloatingAIBot } from "@/components/FloatingAIBot";
import { OnboardingWelcomeModal } from "@/components/OnboardingWelcomeModal";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { i18n } = useTranslation();
  const isSq = (i18n.resolvedLanguage ?? i18n.language).startsWith("sq");

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-background">
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
