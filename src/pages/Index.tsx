import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AIChatWidget } from "@/components/AIChatWidget";
import { Zap, MessageSquare, BarChart3, Bot, ArrowRight } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">LeadPulse</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">AI-Powered Lead Discovery</Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 max-w-3xl mx-auto leading-tight">
          Turn Every Conversation Into a Business Opportunity
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Monitor channels, detect intent with AI, and respond instantly. All from one unified platform.
        </p>
        <div className="flex items-center justify-center gap-3 mb-16">
          <Link to="/register">
            <Button size="lg">
              Start Free Trial <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant="outline" size="lg">View Pricing</Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto text-left">
          <div className="rounded-xl border border-border p-6">
            <MessageSquare className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Unified Inbox</h3>
            <p className="text-sm text-muted-foreground">All your channels in one place — Telegram, Email, WhatsApp, and more.</p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <Bot className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Dedicated AI</h3>
            <p className="text-sm text-muted-foreground">AI that knows your business and responds to customers automatically.</p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <BarChart3 className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Smart Analytics</h3>
            <p className="text-sm text-muted-foreground">Track lead quality, response times, and conversion rates in real-time.</p>
          </div>
        </div>
      </main>

      {/* AI Chat Widget for visitors */}
      <AIChatWidget />
    </div>
  );
};

export default Index;
