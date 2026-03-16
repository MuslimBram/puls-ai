import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AIChatWidget } from "@/components/AIChatWidget";
import {
  Zap, MessageSquare, BarChart3, Bot, ArrowRight, Shield,
  Users, Target, Sparkles, CheckCircle2, Star, Phone,
} from "lucide-react";

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
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">LeadPulse</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">Pricing</Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <Badge variant="secondary" className="mb-4">AI-Powered Lead Discovery</Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 max-w-4xl mx-auto leading-tight">
            Turn Every Conversation Into a Business Opportunity
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Monitor channels, detect intent with AI, and respond instantly. All from one unified platform.
          </p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <Link to="/register">
              <Button size="lg">
                Start Free Trial <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="lg">View Pricing</Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">No credit card required · 14-day free trial</p>
        </section>

        {/* Problem → Solution */}
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto px-4 py-16">
            <div className="grid gap-12 md:grid-cols-2 max-w-5xl mx-auto items-center">
              <div>
                <Badge variant="destructive" className="mb-3">The Problem</Badge>
                <h2 className="text-2xl font-bold text-foreground mb-3">
                  Leads Slip Through the Cracks
                </h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✕</span> Scattered conversations across channels</li>
                  <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✕</span> Slow response times lose deals</li>
                  <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✕</span> No visibility into lead quality or intent</li>
                  <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✕</span> Manual follow-ups don't scale</li>
                </ul>
              </div>
              <div>
                <Badge className="mb-3">The Solution</Badge>
                <h2 className="text-2xl font-bold text-foreground mb-3">
                  One Platform. Full Control.
                </h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unified inbox for all channels</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI analyzes and scores every lead</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Automated responses in your brand voice</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> CRM pipeline tracks every deal</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-2">Everything You Need to Grow</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Built for businesses that want to capture, qualify, and convert leads faster.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {[
              { icon: MessageSquare, title: "Unified Inbox", desc: "Telegram, Email, WhatsApp, Website Chat — all in one place." },
              { icon: Bot, title: "Dedicated AI", desc: "AI that knows your business and responds to customers automatically." },
              { icon: BarChart3, title: "Smart Analytics", desc: "Track lead quality, response times, and conversion rates." },
              { icon: Target, title: "Lead Discovery", desc: "AI monitors channels and discovers potential leads for you." },
              { icon: Users, title: "CRM Pipeline", desc: "Full deal pipeline with stages, tasks, and activity tracking." },
              { icon: Shield, title: "Competitor Intel", desc: "Monitor competitors and get strategic positioning insights." },
              { icon: Sparkles, title: "Campaign Builder", desc: "AI-generated marketing campaigns with content strategy." },
              { icon: Phone, title: "Call Tracking", desc: "Log calls, get AI summaries, and track follow-ups." },
              { icon: Zap, title: "Automation Engine", desc: "Trigger workflows on lead events, messages, and more." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border p-6 hover:border-primary/30 transition-colors">
                <f.icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Summary */}
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto px-4 py-16 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-2">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground mb-8">Start free. Scale as you grow.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto">
              {[
                { name: "Standard", price: "$29", desc: "For getting started" },
                { name: "Professional", price: "$79", desc: "For growing teams", popular: true },
                { name: "Advanced", price: "$149", desc: "For scaling businesses" },
                { name: "Enterprise", price: "Custom", desc: "For large organizations" },
              ].map((p) => (
                <Card key={p.name} className={p.popular ? "border-primary ring-1 ring-primary" : ""}>
                  <CardContent className="pt-6 text-center">
                    {p.popular && <Badge className="mb-2">Most Popular</Badge>}
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    <p className="text-2xl font-bold text-foreground my-1">{p.price}</p>
                    <p className="text-xs text-muted-foreground mb-3">{p.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Link to="/pricing">
              <Button variant="outline" className="mt-6">Compare Plans <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </Link>
          </div>
        </section>

        {/* Testimonials Placeholder */}
        <section className="container mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-2">Trusted by Growing Businesses</h2>
            <p className="text-muted-foreground">See what our customers say.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            {[
              { name: "Sarah K.", role: "Marketing Director", quote: "LeadPulse transformed how we handle inbound leads. Response times dropped by 80%." },
              { name: "Michael R.", role: "Agency Owner", quote: "The AI assistant feels like a team member. It handles initial conversations perfectly." },
              { name: "Elena T.", role: "Sales Manager", quote: "We discovered 3x more qualified leads within the first month of using the platform." },
            ].map((t) => (
              <Card key={t.name}>
                <CardContent className="pt-6">
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-primary text-primary" />)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 italic">"{t.quote}"</p>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border bg-primary/5">
          <div className="container mx-auto px-4 py-16 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-3">Ready to Capture More Leads?</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Join businesses using LeadPulse to discover, qualify, and convert leads with AI.
            </p>
            <Link to="/register">
              <Button size="lg">
                Start Free Trial <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-medium text-foreground">LeadPulse</span>
          </div>
          <p>© {new Date().getFullYear()} LeadPulse. All rights reserved.</p>
        </div>
      </footer>

      <AIChatWidget />
    </div>
  );
};

export default Index;
