import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary, PageErrorFallback } from "@/components/ErrorBoundary";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import BusinessProfile from "./pages/BusinessProfile";
import Leads from "./pages/Leads";
import Keywords from "./pages/Keywords";
import Channels from "./pages/Channels";
import Analytics from "./pages/Analytics";
import Subscription from "./pages/Subscription";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import Inbox from "./pages/Inbox";
import ReplyWorkspace from "./pages/ReplyWorkspace";
import ConnectedAccounts from "./pages/ConnectedAccounts";
import DedicatedAI from "./pages/DedicatedAI";
import ContentCalendar from "./pages/ContentCalendar";
import KnowledgeBase from "./pages/KnowledgeBase";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {children}
    </ErrorBoundary>
  </ProtectedRoute>
);

const App = () => (
  <ErrorBoundary fallback={<PageErrorFallback />}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
              <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
              <Route path="/business-profile" element={<ProtectedPage><BusinessProfile /></ProtectedPage>} />
              <Route path="/leads" element={<ProtectedPage><Leads /></ProtectedPage>} />
              <Route path="/keywords" element={<ProtectedPage><Keywords /></ProtectedPage>} />
              <Route path="/channels" element={<ProtectedPage><Channels /></ProtectedPage>} />
              <Route path="/analytics" element={<ProtectedPage><Analytics /></ProtectedPage>} />
              <Route path="/subscription" element={<ProtectedPage><Subscription /></ProtectedPage>} />
              <Route path="/pricing" element={<ProtectedPage><Pricing /></ProtectedPage>} />
              <Route path="/inbox" element={<ProtectedPage><Inbox /></ProtectedPage>} />
              <Route path="/reply-workspace" element={<ProtectedPage><ReplyWorkspace /></ProtectedPage>} />
              <Route path="/connected-accounts" element={<ProtectedPage><ConnectedAccounts /></ProtectedPage>} />
              <Route path="/dedicated-ai" element={<ProtectedPage><DedicatedAI /></ProtectedPage>} />
              <Route path="/content-calendar" element={<ProtectedPage><ContentCalendar /></ProtectedPage>} />
              <Route path="/admin" element={<ProtectedPage><Admin /></ProtectedPage>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
