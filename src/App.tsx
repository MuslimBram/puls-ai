import { lazy, Suspense } from "react";
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

// Eagerly loaded (critical path)
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy loaded pages
const BusinessProfile = lazy(() => import("./pages/BusinessProfile"));
const Leads = lazy(() => import("./pages/Leads"));
const Keywords = lazy(() => import("./pages/Keywords"));
const Channels = lazy(() => import("./pages/Channels"));
const ConnectionsHub = lazy(() => import("./pages/ConnectionsHub"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminBusinessScanInsights = lazy(() => import("./pages/AdminBusinessScanInsights"));
const Inbox = lazy(() => import("./pages/Inbox"));
const ConnectedAccounts = lazy(() => import("./pages/ConnectedAccounts"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CompetitorIntelligence = lazy(() => import("./pages/CompetitorIntelligence"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard"));
const SessionSecurity = lazy(() => import("./pages/SessionSecurity"));
const CRM = lazy(() => import("./pages/CRM"));
const Helpdesk = lazy(() => import("./pages/Helpdesk"));
const BroadcastMessaging = lazy(() => import("./pages/BroadcastMessaging"));
const Automations = lazy(() => import("./pages/Automations"));
const DeepAnalytics = lazy(() => import("./pages/DeepAnalytics"));
const MediaStudio = lazy(() => import("./pages/MediaStudio"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PublicApi = lazy(() => import("./pages/PublicApi"));
const Telephony = lazy(() => import("./pages/Telephony"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const DeveloperPortal = lazy(() => import("./pages/DeveloperPortal"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Branding = lazy(() => import("./pages/Branding"));
const SalesEngine = lazy(() => import("./pages/SalesEngine"));
const FinancialIntelligence = lazy(() => import("./pages/FinancialIntelligence"));
const SaaSHealth = lazy(() => import("./pages/SaaSHealth"));
const ResellerDashboard = lazy(() => import("./pages/ResellerDashboard"));
const MarketingAutomation = lazy(() => import("./pages/MarketingAutomation"));
const AutonomousOps = lazy(() => import("./pages/AutonomousOps"));
const RevenueEngine = lazy(() => import("./pages/RevenueEngine"));
const GrowthStrategy = lazy(() => import("./pages/GrowthStrategy"));
const MarketExpansion = lazy(() => import("./pages/MarketExpansion"));
const PricingOptimization = lazy(() => import("./pages/PricingOptimization"));
const CompetitiveIntelligenceEngine = lazy(() => import("./pages/CompetitiveIntelligenceEngine"));
const BrandReputation = lazy(() => import("./pages/BrandReputation"));
const CustomerExperience = lazy(() => import("./pages/CustomerExperience"));
const RetentionMaximization = lazy(() => import("./pages/RetentionMaximization"));
const PartnershipEcosystem = lazy(() => import("./pages/PartnershipEcosystem"));
const VisitorReengagement = lazy(() => import("./pages/VisitorReengagement"));
const PersonalizationEngine = lazy(() => import("./pages/PersonalizationEngine"));
const DemandForecasting = lazy(() => import("./pages/DemandForecasting"));
const WorkforceOptimization = lazy(() => import("./pages/WorkforceOptimization"));
const ProcessOptimization = lazy(() => import("./pages/ProcessOptimization"));
const FunnelOptimization = lazy(() => import("./pages/FunnelOptimization"));
const OfferOptimization = lazy(() => import("./pages/OfferOptimization"));
const CustomerValueMaximization = lazy(() => import("./pages/CustomerValueMaximization"));
const CommunityGrowth = lazy(() => import("./pages/CommunityGrowth"));
const LeadMagnets = lazy(() => import("./pages/LeadMagnets"));
const Gamification = lazy(() => import("./pages/Gamification"));
const AIDecisions = lazy(() => import("./pages/AIDecisions"));
const Benchmarks = lazy(() => import("./pages/Benchmarks"));
const GrowthLoop = lazy(() => import("./pages/GrowthLoop"));
const CreditEconomy = lazy(() => import("./pages/CreditEconomy"));
const OpsStability = lazy(() => import("./pages/OpsStability"));
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

const LazyFallback = () => <div className="flex items-center justify-center h-screen text-muted-foreground">Loading…</div>;

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <Suspense fallback={<LazyFallback />}>{children}</Suspense>
    </ErrorBoundary>
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
                <Route path="/install" element={<Suspense fallback={<LazyFallback />}><InstallPage /></Suspense>} />
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
                <Route path="/reseller" element={<ProtectedPage><ResellerDashboard /></ProtectedPage>} />
                <Route path="/marketing-automation" element={<ProtectedPage><MarketingAutomation /></ProtectedPage>} />
                <Route path="/autonomous-ops" element={<ProtectedPage><AutonomousOps /></ProtectedPage>} />
                <Route path="/revenue-engine" element={<ProtectedPage><RevenueEngine /></ProtectedPage>} />
                <Route path="/growth-strategy" element={<ProtectedPage><GrowthStrategy /></ProtectedPage>} />
                <Route path="/market-expansion" element={<ProtectedPage><MarketExpansion /></ProtectedPage>} />
                <Route path="/pricing-optimization" element={<ProtectedPage><PricingOptimization /></ProtectedPage>} />
                <Route path="/competitive-intelligence-engine" element={<ProtectedPage><CompetitiveIntelligenceEngine /></ProtectedPage>} />
                <Route path="/brand-reputation" element={<ProtectedPage><BrandReputation /></ProtectedPage>} />
                <Route path="/customer-experience" element={<ProtectedPage><CustomerExperience /></ProtectedPage>} />
                <Route path="/retention" element={<ProtectedPage><RetentionMaximization /></ProtectedPage>} />
                <Route path="/partnership-ecosystem" element={<ProtectedPage><PartnershipEcosystem /></ProtectedPage>} />
                <Route path="/reengagement" element={<ProtectedPage><VisitorReengagement /></ProtectedPage>} />
                <Route path="/personalization" element={<ProtectedPage><PersonalizationEngine /></ProtectedPage>} />
                <Route path="/demand-forecasting" element={<ProtectedPage><DemandForecasting /></ProtectedPage>} />
                <Route path="/workforce-optimization" element={<ProtectedPage><WorkforceOptimization /></ProtectedPage>} />
                <Route path="/process-optimization" element={<ProtectedPage><ProcessOptimization /></ProtectedPage>} />
                <Route path="/funnel-optimization" element={<ProtectedPage><FunnelOptimization /></ProtectedPage>} />
                <Route path="/offer-optimization" element={<ProtectedPage><OfferOptimization /></ProtectedPage>} />
                <Route path="/customer-value" element={<ProtectedPage><CustomerValueMaximization /></ProtectedPage>} />
                <Route path="/community" element={<ProtectedPage><CommunityGrowth /></ProtectedPage>} />
                <Route path="/lead-magnets" element={<ProtectedPage><LeadMagnets /></ProtectedPage>} />
                <Route path="/gamification" element={<ProtectedPage><Gamification /></ProtectedPage>} />
                <Route path="/ai-decisions" element={<ProtectedPage><AIDecisions /></ProtectedPage>} />
                <Route path="/benchmarks" element={<ProtectedPage><Benchmarks /></ProtectedPage>} />
                <Route path="/growth-loop" element={<ProtectedPage><GrowthLoop /></ProtectedPage>} />
                <Route path="/credits" element={<ProtectedPage><CreditEconomy /></ProtectedPage>} />
                <Route path="/ops-stability" element={<ProtectedPage><OpsStability /></ProtectedPage>} />
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
