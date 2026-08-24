import { ReactNode, useState } from "react";
import { BrandingThemeProvider } from "@/components/BrandingThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ReferralIncentivePopup } from "@/components/ReferralIncentivePopup";
import { FloatingAIBot } from "@/components/FloatingAIBot";
import { OnboardingWelcomeModal } from "@/components/OnboardingWelcomeModal";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <BrandingThemeProvider />

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Mbyll menunë"
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
