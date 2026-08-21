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
import { AdminRoute } from "@/components/AdminRoute";
import { PermissionRoute } from "@/components/PermissionRoute";
import type { RolePermissions } from "@/hooks/useRolePermissions";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";

// Public legal pages
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const SecurityOverview = lazy(() => import("./pages/legal/SecurityOverview"));
const CookiePolicy = lazy(() => import("./pages/legal/CookiePolicy"));
const RefundPolicy = lazy(() => import("./pages/legal/RefundPolicy"));
const AffiliateTerms = lazy(() => import("./pages/legal/AffiliateTerms"));
const DPA = lazy(() => import("./pages/legal/DPA"));
const TermsAndPayments = lazy(() => import("./pages/TermsAndPayments"));
const WhiteLabel = lazy(() => import("./pages/WhiteLabel"));

// Eagerly loaded (critical path)
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
const CompletePayment = lazy(() => import("./pages/CompletePayment"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

// Lazy loaded pages
const BusinessProfile = lazy(() => import("./pages/BusinessProfile"));
const Leads = lazy(() => import("./pages/Leads"));
const Keywords = lazy(() => import("./pages/Keywords"));
const Channels = lazy(() => import("./pages/Channels"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const ConnectionsHub = lazy(() => import("./pages/ConnectionsHub"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminBusinessScanInsights = lazy(() => import("./pages/AdminBusinessScanInsights"));
const AdminIntegrationHub = lazy(() => import("./pages/AdminIntegrationHub"));
const ActivationDashboard = lazy(() => import("./pages/ActivationDashboard"));
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
const AIMarketplace = lazy(() => import("./pages/AIMarketplace"));
const AITrainingCenter = lazy(() => import("./pages/AITrainingCenter"));
const AISetupAssistant = lazy(() => import("./pages/AISetupAssistant"));
const IntegrationWizard = lazy(() => import("./pages/IntegrationWizard"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PublicApi = lazy(() => import("./pages/PublicApi"));
const Telephony = lazy(() => import("./pages/Telephony"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const DeveloperPortal = lazy(() => import("./pages/DeveloperPortal"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const WaitingApproval = lazy(() => import("./pages/WaitingApproval"));
const Landing = lazy(() => import("./pages/Landing"));
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
const WalletPage = lazy(() => import("./pages/Wallet"));
const InstallPage = lazy(() => import("./pages/Install"));
const Sources = lazy(() => import("./pages/Sources"));
const SEOAudit = lazy(() => import("./pages/SEOAudit"));
const ReferralProgram = lazy(() => import("./pages/ReferralProgram"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const ManagedBusinesses = lazy(() => import("./pages/ManagedBusinesses"));
const SupportTickets = lazy(() => import("./pages/SupportTickets"));
const AdminSupportTickets = lazy(() => import("./pages/AdminSupportTickets"));
const SystemStatus = lazy(() => import("./pages/SystemStatus"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const LidhjetOverview = lazy(() => import("./pages/lidhjet/LidhjetOverview"));

// Public website — Wave 1
const PublicPricing = lazy(() => import("./pages/public/PublicPricing"));
const PublicSecurity = lazy(() => import("./pages/public/PublicSecurity"));
const PublicDevelopers = lazy(() => import("./pages/public/PublicDevelopers"));
const PublicAIIntelligence = lazy(() => import("./pages/public/PublicAIIntelligence"));
const PublicUnifiedInbox = lazy(() => import("./pages/public/PublicUnifiedInbox"));
const PublicCRMSales = lazy(() => import("./pages/public/PublicCRMSales"));
const PublicMarketing = lazy(() => import("./pages/public/PublicMarketing"));
const PublicAutomation = lazy(() => import("./pages/public/PublicAutomation"));
const PublicAnalytics = lazy(() => import("./pages/public/PublicAnalytics"));
const PublicAbout = lazy(() => import("./pages/public/PublicAbout"));
const PublicContact = lazy(() => import("./pages/public/PublicContact"));
const PublicPartners = lazy(() => import("./pages/public/PublicPartners"));
const PublicGrowthSuite = lazy(() => import("./pages/public/PublicGrowthSuite"));
const LidhjetOnboarding = lazy(() => import("./pages/lidhjet/LidhjetOnboarding"));
const LidhjetFeed = lazy(() => import("./pages/lidhjet/LidhjetFeed"));
const LidhjetInterests = lazy(() => import("./pages/lidhjet/LidhjetInterests"));
const LidhjetAdminModeration = lazy(() => import("./pages/lidhjet/LidhjetAdminModeration"));
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

const AdminPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AdminRoute>
      <ErrorBoundary fallback={<PageErrorFallback />}>
        <Suspense fallback={<LazyFallback />}>{children}</Suspense>
      </ErrorBoundary>
    </AdminRoute>
  </ProtectedRoute>
);

const PermissionPage = ({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission: keyof RolePermissions;
}) => (
  <ProtectedRoute>
    <PermissionRoute permission={permission}>
      <ErrorBoundary fallback={<PageErrorFallback />}>
        <Suspense fallback={<LazyFallback />}>{children}</Suspense>
      </ErrorBoundary>
    </PermissionRoute>
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
                <Route path="/unsubscribe" element={<Suspense fallback={<LazyFallback />}><Unsubscribe /></Suspense>} />
                <Route path="/auth/callback" element={<Suspense fallback={<LazyFallback />}><AuthCallback /></Suspense>} />
                <Route path="/.lovable/oauth/consent" element={<Suspense fallback={<LazyFallback />}><OAuthConsent /></Suspense>} />
                <Route path="/pricing" element={<Suspense fallback={<LazyFallback />}><PublicPricing /></Suspense>} />
                <Route path="/white-label" element={<WhiteLabel />} />

                {/* Public legal pages */}
                <Route path="/privacy" element={<Suspense fallback={<LazyFallback />}><PrivacyPolicy /></Suspense>} />
                <Route path="/terms" element={<Suspense fallback={<LazyFallback />}><TermsOfService /></Suspense>} />
                <Route path="/security" element={<Suspense fallback={<LazyFallback />}><PublicSecurity /></Suspense>} />
                <Route path="/security/overview" element={<Suspense fallback={<LazyFallback />}><SecurityOverview /></Suspense>} />
                <Route path="/cookies" element={<Suspense fallback={<LazyFallback />}><CookiePolicy /></Suspense>} />
                <Route path="/refund" element={<Suspense fallback={<LazyFallback />}><RefundPolicy /></Suspense>} />
                <Route path="/affiliate-terms" element={<Suspense fallback={<LazyFallback />}><AffiliateTerms /></Suspense>} />
                <Route path="/dpa" element={<Suspense fallback={<LazyFallback />}><DPA /></Suspense>} />
                <Route path="/terms-and-payments" element={<Suspense fallback={<LazyFallback />}><TermsAndPayments /></Suspense>} />

                {/* Public website — Wave 1 platform routes */}
                <Route path="/platform/ai-intelligence" element={<Suspense fallback={<LazyFallback />}><PublicAIIntelligence /></Suspense>} />
                <Route path="/platform/unified-inbox" element={<Suspense fallback={<LazyFallback />}><PublicUnifiedInbox /></Suspense>} />
                <Route path="/platform/crm-sales" element={<Suspense fallback={<LazyFallback />}><PublicCRMSales /></Suspense>} />
                <Route path="/platform/marketing" element={<Suspense fallback={<LazyFallback />}><PublicMarketing /></Suspense>} />
                <Route path="/platform/automation" element={<Suspense fallback={<LazyFallback />}><PublicAutomation /></Suspense>} />
                <Route path="/platform/analytics" element={<Suspense fallback={<LazyFallback />}><PublicAnalytics /></Suspense>} />
                <Route path="/platform/developers" element={<Suspense fallback={<LazyFallback />}><PublicDevelopers /></Suspense>} />

                {/* Public website — Wave 1 company routes */}
                <Route path="/about" element={<Suspense fallback={<LazyFallback />}><PublicAbout /></Suspense>} />
                <Route path="/contact" element={<Suspense fallback={<LazyFallback />}><PublicContact /></Suspense>} />
                <Route path="/partners" element={<Suspense fallback={<LazyFallback />}><PublicPartners /></Suspense>} />
                <Route path="/growth-suite" element={<Suspense fallback={<LazyFallback />}><PublicGrowthSuite /></Suspense>} />
                <Route path="/complete-payment" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><CompletePayment /></Suspense></ProtectedRoute>} />

                <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
                <Route path="/inbox" element={<PermissionPage permission="canRespondInbox"><Inbox /></PermissionPage>} />
                <Route path="/leads" element={<PermissionPage permission="canViewCRM"><Leads /></PermissionPage>} />
                <Route path="/crm" element={<PermissionPage permission="canViewCRM"><CRM /></PermissionPage>} />
                <Route path="/campaigns" element={<PermissionPage permission="canManageCampaigns"><Campaigns /></PermissionPage>} />
                <Route path="/analytics" element={<PermissionPage permission="canViewAnalytics"><Analytics /></PermissionPage>} />
                <Route path="/keywords" element={<PermissionPage permission="canViewAnalytics"><Keywords /></PermissionPage>} />
                <Route path="/automations" element={<PermissionPage permission="canConfigureAutomations"><Automations /></PermissionPage>} />
                <Route path="/competitor-intelligence" element={<PermissionPage permission="canViewAnalytics"><CompetitorIntelligence /></PermissionPage>} />
                <Route path="/seo-audit" element={<PermissionPage permission="canViewAnalytics"><SEOAudit /></PermissionPage>} />
                <Route path="/knowledge-base" element={<PermissionPage permission="canViewAnalytics"><KnowledgeBase /></PermissionPage>} />
                <Route path="/media-studio" element={<PermissionPage permission="canManageCampaigns"><MediaStudio /></PermissionPage>} />
                <Route path="/ai-marketplace" element={<PermissionPage permission="canConfigureAutomations"><AIMarketplace /></PermissionPage>} />
                <Route path="/ai-training" element={<PermissionPage permission="canConfigureAutomations"><AITrainingCenter /></PermissionPage>} />
                <Route path="/ai-setup" element={<PermissionPage permission="canConfigureAutomations"><AISetupAssistant /></PermissionPage>} />
                <Route path="/integration-wizard" element={<PermissionPage permission="canConnectChannels"><IntegrationWizard /></PermissionPage>} />
                <Route path="/broadcast" element={<PermissionPage permission="canManageCampaigns"><BroadcastMessaging /></PermissionPage>} />
                <Route path="/helpdesk" element={<PermissionPage permission="canRespondInbox"><Helpdesk /></PermissionPage>} />
                <Route path="/telephony" element={<PermissionPage permission="canRespondInbox"><Telephony /></PermissionPage>} />
                <Route path="/channels" element={<PermissionPage permission="canConnectChannels"><Channels /></PermissionPage>} />
                <Route path="/oauth/callback" element={<Suspense fallback={<LazyFallback />}><OAuthCallback /></Suspense>} />
                <Route path="/connections" element={<PermissionPage permission="canConnectChannels"><ConnectionsHub /></PermissionPage>} />
                <Route path="/connected-accounts" element={<PermissionPage permission="canConnectChannels"><ConnectedAccounts /></PermissionPage>} />
                <Route path="/business-profile" element={<ProtectedPage><BusinessProfile /></ProtectedPage>} />
                <Route path="/subscription" element={<PermissionPage permission="canAccessBilling"><Subscription /></PermissionPage>} />
                <Route path="/partner" element={<ProtectedPage><PartnerDashboard /></ProtectedPage>} />
                <Route path="/session-security" element={<ProtectedPage><SessionSecurity /></ProtectedPage>} />
                <Route path="/branding" element={<PermissionPage permission="canAccessBilling"><Branding /></PermissionPage>} />
                <Route path="/admin" element={<AdminPage><Admin /></AdminPage>} />
                <Route path="/admin/lidhjet" element={<AdminPage><LidhjetAdminModeration /></AdminPage>} />
                <Route path="/lidhjet" element={<ProtectedPage><LidhjetOverview /></ProtectedPage>} />
                <Route path="/lidhjet/onboarding" element={<ProtectedPage><LidhjetOnboarding /></ProtectedPage>} />
                <Route path="/lidhjet/feed" element={<ProtectedPage><LidhjetFeed /></ProtectedPage>} />
                <Route path="/lidhjet/interests" element={<ProtectedPage><LidhjetInterests /></ProtectedPage>} />
                <Route path="/admin/businesses/:businessId/scan-insights" element={<AdminPage><AdminBusinessScanInsights /></AdminPage>} />
                <Route path="/admin/integration-hub" element={<AdminPage><AdminIntegrationHub /></AdminPage>} />
                <Route path="/admin/activation" element={<AdminPage><ActivationDashboard /></AdminPage>} />
                <Route path="/deep-analytics" element={<AdminPage><DeepAnalytics /></AdminPage>} />
                <Route path="/public-api" element={<PermissionPage permission="canConnectChannels"><PublicApi /></PermissionPage>} />
                <Route path="/marketplace" element={<PermissionPage permission="canConnectChannels"><Marketplace /></PermissionPage>} />
                <Route path="/developer" element={<PermissionPage permission="canConnectChannels"><DeveloperPortal /></PermissionPage>} />
                <Route path="/onboarding" element={<ProtectedPage><Onboarding /></ProtectedPage>} />
                <Route path="/sales-engine" element={<PermissionPage permission="canViewCRM"><SalesEngine /></PermissionPage>} />
                <Route path="/financial-intelligence" element={<PermissionPage permission="canAccessBilling"><FinancialIntelligence /></PermissionPage>} />
                <Route path="/saas-health" element={<AdminPage><SaaSHealth /></AdminPage>} />
                <Route path="/reseller" element={<PermissionPage permission="canAccessBilling"><ResellerDashboard /></PermissionPage>} />
                <Route path="/marketing-automation" element={<PermissionPage permission="canConfigureAutomations"><MarketingAutomation /></PermissionPage>} />
                <Route path="/autonomous-ops" element={<PermissionPage permission="canConfigureAutomations"><AutonomousOps /></PermissionPage>} />
                <Route path="/revenue-engine" element={<PermissionPage permission="canViewAnalytics"><RevenueEngine /></PermissionPage>} />
                <Route path="/growth-strategy" element={<PermissionPage permission="canConfigureAutomations"><GrowthStrategy /></PermissionPage>} />
                <Route path="/market-expansion" element={<PermissionPage permission="canConfigureAutomations"><MarketExpansion /></PermissionPage>} />
                <Route path="/pricing-optimization" element={<PermissionPage permission="canViewAnalytics"><PricingOptimization /></PermissionPage>} />
                <Route path="/competitive-intelligence-engine" element={<Navigate to="/competitor-intelligence" replace />} />
                <Route path="/brand-reputation" element={<PermissionPage permission="canViewAnalytics"><BrandReputation /></PermissionPage>} />
                <Route path="/customer-experience" element={<PermissionPage permission="canViewAnalytics"><CustomerExperience /></PermissionPage>} />
                <Route path="/retention" element={<PermissionPage permission="canViewAnalytics"><RetentionMaximization /></PermissionPage>} />
                <Route path="/partnership-ecosystem" element={<PermissionPage permission="canManageCampaigns"><PartnershipEcosystem /></PermissionPage>} />
                <Route path="/reengagement" element={<PermissionPage permission="canManageCampaigns"><VisitorReengagement /></PermissionPage>} />
                <Route path="/personalization" element={<PermissionPage permission="canViewAnalytics"><PersonalizationEngine /></PermissionPage>} />
                <Route path="/demand-forecasting" element={<PermissionPage permission="canViewAnalytics"><DemandForecasting /></PermissionPage>} />
                <Route path="/workforce-optimization" element={<PermissionPage permission="canViewAnalytics"><WorkforceOptimization /></PermissionPage>} />
                <Route path="/process-optimization" element={<PermissionPage permission="canViewAnalytics"><ProcessOptimization /></PermissionPage>} />
                <Route path="/funnel-optimization" element={<PermissionPage permission="canViewAnalytics"><FunnelOptimization /></PermissionPage>} />
                <Route path="/offer-optimization" element={<Navigate to="/pricing-optimization" replace />} />
                <Route path="/customer-value" element={<PermissionPage permission="canViewAnalytics"><CustomerValueMaximization /></PermissionPage>} />
                <Route path="/community" element={<PermissionPage permission="canManageCampaigns"><CommunityGrowth /></PermissionPage>} />
                <Route path="/lead-magnets" element={<PermissionPage permission="canManageCampaigns"><LeadMagnets /></PermissionPage>} />
                <Route path="/gamification" element={<PermissionPage permission="canManageCampaigns"><Gamification /></PermissionPage>} />
                <Route path="/ai-decisions" element={<PermissionPage permission="canConfigureAutomations"><AIDecisions /></PermissionPage>} />
                <Route path="/benchmarks" element={<PermissionPage permission="canViewAnalytics"><Benchmarks /></PermissionPage>} />
                <Route path="/growth-loop" element={<PermissionPage permission="canManageCampaigns"><GrowthLoop /></PermissionPage>} />
                <Route path="/credits" element={<PermissionPage permission="canAccessBilling"><CreditEconomy /></PermissionPage>} />
                <Route path="/ops-stability" element={<PermissionPage permission="canViewAnalytics"><OpsStability /></PermissionPage>} />
                <Route path="/system-status" element={<ProtectedPage><SystemStatus /></ProtectedPage>} />
                <Route path="/wallet" element={<ProtectedPage><WalletPage /></ProtectedPage>} />
                <Route path="/external-integrations" element={<Navigate to="/connected-accounts?tab=integrations" replace />} />

                <Route path="/contact-hub" element={<Navigate to="/crm?tab=contacts" replace />} />
                <Route path="/call-history" element={<Navigate to="/crm?tab=calls" replace />} />
                <Route path="/content-calendar" element={<PermissionPage permission="canManageCampaigns"><Suspense fallback={<LazyFallback />}><ContentCalendar /></Suspense></PermissionPage>} />
                <Route path="/sources" element={<AdminPage><Sources /></AdminPage>} />
                <Route path="/reply-workspace" element={<Navigate to="/inbox" replace />} />
                <Route path="/dedicated-ai" element={<Navigate to="/knowledge-base" replace />} />
                <Route path="/visitor-intelligence" element={<Navigate to="/helpdesk" replace />} />
                <Route path="/lead-qualification" element={<Navigate to="/helpdesk" replace />} />
                <Route path="/referral-program" element={<ProtectedPage><ReferralProgram /></ProtectedPage>} />
                <Route path="/referrals" element={<Navigate to="/referral-program" replace />} />
                <Route path="/help-center" element={<ProtectedPage><HelpCenter /></ProtectedPage>} />
                <Route path="/managed-businesses" element={<ProtectedPage><ManagedBusinesses /></ProtectedPage>} />
                <Route path="/support" element={<ProtectedPage><SupportTickets /></ProtectedPage>} />
                <Route path="/admin/support-tickets" element={<AdminPage><AdminSupportTickets /></AdminPage>} />
                <Route path="/partner-clients" element={<Navigate to="/partner" replace />} />
                <Route path="/business-insights" element={<Navigate to="/deep-analytics?tab=insights" replace />} />

                <Route path="/waiting-approval" element={<Suspense fallback={<LazyFallback />}><WaitingApproval /></Suspense>} />
        <Route path="/landing" element={<Suspense fallback={<LazyFallback />}><Landing /></Suspense>} />
        <Route path="*" element={<NotFound />} />
              </Routes>
              <PWAInstallPrompt />
              <CookieConsentBanner />
            </BrowserRouter>
          </TooltipProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
