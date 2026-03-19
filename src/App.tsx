import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary, PageErrorFallback } from "@/components/ErrorBoundary";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import BusinessProfile from "./pages/BusinessProfile";
import Leads from "./pages/Leads";
import Keywords from "./pages/Keywords";
import Channels from "./pages/Channels";
import ConnectionsHub from "./pages/ConnectionsHub";
import Analytics from "./pages/Analytics";
import Subscription from "./pages/Subscription";
import Admin from "./pages/Admin";
import AdminBusinessScanInsights from "./pages/AdminBusinessScanInsights";
import Inbox from "./pages/Inbox";
import ConnectedAccounts from "./pages/ConnectedAccounts";
import KnowledgeBase from "./pages/KnowledgeBase";
import Campaigns from "./pages/Campaigns";
import CompetitorIntelligence from "./pages/CompetitorIntelligence";
import PartnerDashboard from "./pages/PartnerDashboard";
import SessionSecurity from "./pages/SessionSecurity";
import CRM from "./pages/CRM";

import Helpdesk from "./pages/Helpdesk";
import BroadcastMessaging from "./pages/BroadcastMessaging";
import Automations from "./pages/Automations";
import DeepAnalytics from "./pages/DeepAnalytics";
import MediaStudio from "./pages/MediaStudio";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import PublicApi from "./pages/PublicApi";
import Telephony from "./pages/Telephony";
import Marketplace from "./pages/Marketplace";
import DeveloperPortal from "./pages/DeveloperPortal";
import Onboarding from "./pages/Onboarding";
import Branding from "./pages/Branding";
import SalesEngine from "./pages/SalesEngine";
import FinancialIntelligence from "./pages/FinancialIntelligence";
import SaaSHealth from "./pages/SaaSHealth";
import ResellerDashboard from "./pages/ResellerDashboard";
import MarketingAutomation from "./pages/MarketingAutomation";
import AutonomousOps from "./pages/AutonomousOps";
import RevenueEngine from "./pages/RevenueEngine";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <ErrorBoundary fallback={<PageErrorFallback />}>{children}</ErrorBoundary>
  </ProtectedRoute>
);

const App = () => (
  <ErrorBoundary fallback={<PageErrorFallback />}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/pricing" element={<Pricing />} />

                <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
                <Route path="/inbox" element={<ProtectedPage><Inbox /></ProtectedPage>} />
                <Route path="/leads" element={<ProtectedPage><Leads /></ProtectedPage>} />
                <Route path="/crm" element={<ProtectedPage><CRM /></ProtectedPage>} />
                <Route path="/campaigns" element={<ProtectedPage><Campaigns /></ProtectedPage>} />
                <Route path="/analytics" element={<ProtectedPage><Analytics /></ProtectedPage>} />
                <Route path="/keywords" element={<ProtectedPage><Keywords /></ProtectedPage>} />
                <Route path="/automations" element={<ProtectedPage><Automations /></ProtectedPage>} />
                <Route path="/competitor-intelligence" element={<ProtectedPage><CompetitorIntelligence /></ProtectedPage>} />
                <Route path="/knowledge-base" element={<ProtectedPage><KnowledgeBase /></ProtectedPage>} />
                <Route path="/media-studio" element={<ProtectedPage><MediaStudio /></ProtectedPage>} />
                <Route path="/broadcast" element={<ProtectedPage><BroadcastMessaging /></ProtectedPage>} />
                <Route path="/helpdesk" element={<ProtectedPage><Helpdesk /></ProtectedPage>} />
                <Route path="/telephony" element={<ProtectedPage><Telephony /></ProtectedPage>} />
                <Route path="/channels" element={<ProtectedPage><Channels /></ProtectedPage>} />
                <Route path="/connections" element={<ProtectedPage><ConnectionsHub /></ProtectedPage>} />
                <Route path="/connected-accounts" element={<ProtectedPage><ConnectedAccounts /></ProtectedPage>} />
                <Route path="/business-profile" element={<ProtectedPage><BusinessProfile /></ProtectedPage>} />
                <Route path="/subscription" element={<ProtectedPage><Subscription /></ProtectedPage>} />
                <Route path="/partner" element={<ProtectedPage><PartnerDashboard /></ProtectedPage>} />
                <Route path="/security" element={<ProtectedPage><SessionSecurity /></ProtectedPage>} />
                <Route path="/branding" element={<ProtectedPage><Branding /></ProtectedPage>} />
                <Route path="/admin" element={<ProtectedPage><Admin /></ProtectedPage>} />
                <Route path="/admin/businesses/:businessId/scan-insights" element={<ProtectedPage><AdminBusinessScanInsights /></ProtectedPage>} />
                <Route path="/deep-analytics" element={<ProtectedPage><DeepAnalytics /></ProtectedPage>} />
                <Route path="/public-api" element={<ProtectedPage><PublicApi /></ProtectedPage>} />
                <Route path="/marketplace" element={<ProtectedPage><Marketplace /></ProtectedPage>} />
                <Route path="/developer" element={<ProtectedPage><DeveloperPortal /></ProtectedPage>} />
                <Route path="/onboarding" element={<ProtectedPage><Onboarding /></ProtectedPage>} />
                <Route path="/sales-engine" element={<ProtectedPage><SalesEngine /></ProtectedPage>} />
                <Route path="/financial-intelligence" element={<ProtectedPage><FinancialIntelligence /></ProtectedPage>} />
                <Route path="/saas-health" element={<ProtectedPage><SaaSHealth /></ProtectedPage>} />
                <Route path="/external-integrations" element={<Navigate to="/connected-accounts?tab=integrations" replace />} />

                <Route path="/contact-hub" element={<Navigate to="/crm?tab=contacts" replace />} />
                <Route path="/call-history" element={<Navigate to="/crm?tab=calls" replace />} />
                <Route path="/content-calendar" element={<Navigate to="/campaigns?tab=calendar" replace />} />
                <Route path="/sources" element={<Navigate to="/channels?tab=sources" replace />} />
                <Route path="/reply-workspace" element={<Navigate to="/inbox" replace />} />
                <Route path="/dedicated-ai" element={<Navigate to="/knowledge-base" replace />} />
                <Route path="/visitor-intelligence" element={<Navigate to="/helpdesk" replace />} />
                <Route path="/lead-qualification" element={<Navigate to="/helpdesk" replace />} />
                <Route path="/referrals" element={<Navigate to="/partner" replace />} />
                <Route path="/partner-clients" element={<Navigate to="/partner" replace />} />
                <Route path="/business-insights" element={<Navigate to="/deep-analytics?tab=insights" replace />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
              <PWAInstallPrompt />
            </BrowserRouter>
          </TooltipProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
