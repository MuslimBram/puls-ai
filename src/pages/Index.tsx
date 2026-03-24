import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AIChatWidget } from "@/components/AIChatWidget";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  Zap, MessageSquare, BarChart3, Bot, ArrowRight, Shield,
  Users, Target, Sparkles, CheckCircle2, Star, Phone,
} from "lucide-react";
import { BusinessCapabilities } from "@/components/landing/BusinessCapabilities";
import { FreelancerCapabilities } from "@/components/landing/FreelancerCapabilities";

const COMMUNITY_PHOTOS = [
  "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1463453091185-61582044d556?w=120&h=120&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&h=120&fit=crop&crop=face",
];

const Index = () => {
  const { user, loading } = useAuth();
  const { plans } = useMonetizationCatalog();
  const scrollRef = useScrollAnimation();

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
    <div className="min-h-screen bg-background" ref={scrollRef}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">Pulse AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">Pricing</Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
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
          <Badge variant="secondary" className="mb-4 animate-fade-in-up">AI-Powered Lead Discovery</Badge>
          <h1 className="mx-auto mb-4 max-w-4xl text-4xl font-bold leading-tight text-foreground md:text-5xl lg:text-6xl animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            Turn Every Conversation Into a Business Opportunity
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            Monitor channels, detect intent with AI, and respond instantly. All from one unified platform.
          </p>
          <div className="mb-4 flex items-center justify-center gap-3 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <Link to="/register">
              <Button size="lg" className="hover-lift">
                Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="lg" className="hover-lift">View Pricing</Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground animate-fade-in-up" style={{ animationDelay: "400ms" }}>
            No credit card required · 7-day free trial
          </p>
        </section>

        {/* Problem / Solution */}
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto px-4 py-16">
            <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
              <div className="animate-on-scroll">
                <Badge variant="destructive" className="mb-3">The Problem</Badge>
                <h2 className="mb-3 text-2xl font-bold text-foreground">
                  Leads Slip Through the Cracks
                </h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-destructive">✕</span> Scattered conversations across channels</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-destructive">✕</span> Slow response times lose deals</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-destructive">✕</span> No visibility into lead quality or intent</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-destructive">✕</span> Manual follow-ups don't scale</li>
                </ul>
              </div>
              <div className="animate-on-scroll" style={{ transitionDelay: "150ms" }}>
                <Badge className="mb-3">The Solution</Badge>
                <h2 className="mb-3 text-2xl font-bold text-foreground">
                  One Platform. Full Control.
                </h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Unified inbox for all channels</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> AI analyzes and scores every lead</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Automated responses in your brand voice</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> CRM pipeline tracks every deal</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto px-4 py-16">
          <div className="mb-12 text-center animate-on-scroll">
            <h2 className="mb-2 text-3xl font-bold text-foreground">Everything You Need to Grow</h2>
            <p className="mx-auto max-w-lg text-muted-foreground">Built for businesses that want to capture, qualify, and convert leads faster.</p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-children">
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
              <div key={f.title} className="rounded-xl border border-border p-6 hover-lift card-glow">
                <f.icon className="mb-3 h-8 w-8 text-primary" />
                <h3 className="mb-1 font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <BusinessCapabilities />
        <FreelancerCapabilities />

        {/* Pricing Preview */}
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto px-4 py-16 text-center">
            <div className="animate-on-scroll">
              <h2 className="mb-2 text-3xl font-bold text-foreground">Live Pricing From the Product Catalog</h2>
              <p className="mb-8 text-muted-foreground">Plans, labels, and pricing stay aligned with the backend.</p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
              {plans.slice(0, 4).map((plan) => (
                <Card key={plan.key} className={`hover-lift card-glow ${plan.highlighted ? "border-primary ring-1 ring-primary" : ""}`}>
                  <CardContent className="pt-6 text-center">
                    {plan.highlighted && <Badge className="mb-2">Recommended</Badge>}
                    <h3 className="font-semibold text-foreground">{plan.name}</h3>
                    <p className="my-1 text-2xl font-bold text-foreground">{plan.key === "enterprise" ? "Custom" : `€${plan.monthlyPrice}`}</p>
                    <p className="mb-3 text-xs text-muted-foreground">{plan.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Link to="/pricing">
              <Button variant="outline" className="mt-6 hover-lift">Compare Plans <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </Link>
          </div>
        </section>

        {/* Testimonials with gradient bg */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-primary/5" />
          <div className="container relative mx-auto px-4 py-16">
            <div className="mb-10 text-center animate-on-scroll">
              <h2 className="mb-2 text-3xl font-bold text-foreground">Trusted by Growing Businesses</h2>
              <p className="text-muted-foreground">See what our customers say.</p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3 stagger-children">
              {[
                { name: "Sarah K.", role: "Marketing Director", quote: "Pulse AI transformed how we handle inbound leads. Response times dropped by 80%." },
                { name: "Michael R.", role: "Agency Owner", quote: "The AI assistant feels like a team member. It handles initial conversations perfectly." },
                { name: "Elena T.", role: "Sales Manager", quote: "We discovered 3x more qualified leads within the first month of using the platform." },
              ].map((t) => (
                <Card key={t.name} className="hover-lift card-glow">
                  <CardContent className="pt-6">
                    <div className="mb-3 flex gap-0.5">
                      {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-primary text-primary" />)}
                    </div>
                    <p className="mb-4 text-sm italic text-muted-foreground">"{t.quote}"</p>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Community Marquee */}
        <section className="border-t border-border bg-muted/20 py-16">
          <div className="mb-8 text-center animate-on-scroll">
            <h2 className="mb-2 text-2xl font-bold text-foreground">Join Our Community of Successful Business Owners</h2>
            <p className="text-muted-foreground">Thousands of businesses and freelancers growing together.</p>
          </div>

          {/* Marquee Row 1 */}
          <div className="marquee-container mb-4">
            <div className="marquee-track animate-marquee">
              {[...COMMUNITY_PHOTOS, ...COMMUNITY_PHOTOS].map((src, i) => (
                <img
                  key={`r1-${i}`}
                  src={src}
                  alt="Community member"
                  className="mx-2 h-20 w-20 rounded-xl object-cover shadow-md"
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          {/* Marquee Row 2 (reverse) */}
          <div className="marquee-container mb-8">
            <div className="marquee-track animate-marquee-reverse">
              {[...COMMUNITY_PHOTOS.slice().reverse(), ...COMMUNITY_PHOTOS.slice().reverse()].map((src, i) => (
                <img
                  key={`r2-${i}`}
                  src={src}
                  alt="Community member"
                  className="mx-2 h-20 w-20 rounded-xl object-cover shadow-md"
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          <div className="text-center animate-on-scroll">
            <Link to="/register">
              <Button size="lg" className="hover-lift">
                Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5" />
          <div className="container relative mx-auto px-4 py-16 text-center animate-on-scroll">
            <h2 className="mb-3 text-3xl font-bold text-foreground">Ready to Capture More Leads?</h2>
            <p className="mx-auto mb-6 max-w-md text-muted-foreground">
              Join businesses using Pulse AI to discover, qualify, and convert leads with AI.
            </p>
            <Link to="/register">
              <Button size="lg" className="hover-lift">
                Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-medium text-foreground">Pulse AI</span>
          </div>
          <p>© {new Date().getFullYear()} Pulse AI. All rights reserved.</p>
        </div>
      </footer>

      <AIChatWidget />
    </div>
  );
};

export default Index;
