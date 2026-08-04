// src/pages/Landing.tsx
// ============================================================
// Landing page publike — pa auth
// Shfaq: hero, features, çmimet, forma lead capture
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, Zap, Brain, Shield, BarChart3,
  MessageSquare, Users, Star, ArrowRight, Phone,
  Instagram, Inbox, Sparkles, Target, TrendingUp, ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEGAL_LINKS } from "@/components/legal/LegalLayout";


const FEATURES = [
  { icon: Inbox, title: "Unified Inbox", desc: "WhatsApp, Instagram, Facebook, SMS — everything in one place. AI replies 24/7." },
  { icon: Brain, title: "AI with Memory", desc: "Learns prices, products and FAQs from your posts. No manual configuration." },
  { icon: Target, title: "Automatic Lead Capture", desc: "Every DM, every comment → automatic lead → CRM → follow-up with no manual work." },
  { icon: TrendingUp, title: "Revenue Intelligence", desc: "Lead scoring, churn prediction, automatic upsell. Know when the customer is ready to buy." },
  { icon: BarChart3, title: "Live CEO Dashboard", desc: "Leads, Revenue, Ads, Calls, KPIs — everything live in one dashboard." },
  { icon: Shield, title: "Enterprise Security", desc: "Device Trust AI, AES-GCM encryption, admin approval for new devices." },
];

const PLANS = [
  {
    name: "Starter", price: "9,900 ALL", period: "/mo",
    desc: "For small businesses",
    features: ["1 channel (IG or WA)", "1,000 AI messages/mo", "Basic CRM", "Dashboard"],
    cta: "Start 7-day free trial", highlight: false,
  },
  {
    name: "Growth", price: "19,900 ALL", period: "/mo",
    desc: "For growing businesses",
    features: ["3 channels (IG+WA+FB)", "5,000 AI messages/mo", "Revenue Intelligence", "Automated sequences", "Email campaigns", "Online bookings"],
    cta: "Start 7-day free trial", highlight: true,
  },
  {
    name: "Pro", price: "39,900 ALL", period: "/mo",
    desc: "For agencies and teams",
    features: ["Unlimited channels", "20,000 AI messages/mo", "Live CEO Dashboard", "Ads sync (Meta+Google)", "PDF Invoices + Contracts", "Business Memory Engine", "Partner program"],
    cta: "Contact for demo", highlight: false,
  },
];

const TESTIMONIALS = [
  { name: "Erjona K.", biz: "Beauty Salon, Tirana", text: "Before Pulse AI I was juggling 50 DMs every day. Now the AI handles 90% automatically and I focus on real work.", stars: 5 },
  { name: "Artan M.", biz: "Restaurant, Vlora", text: "Reservations now happen by themselves. Customers book directly from Instagram and get automatic reminders. Zero lost reservations.", stars: 5 },
  { name: "Blerim H.", biz: "Gym, Durres", text: "Revenue Intelligence tells me who is about to churn two weeks in advance. I never had this insight. I save 3-4 members per month.", stars: 5 },
];

export default function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleQuickSignup = async () => {
    if (!email) return;
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-lead-capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name: email.split("@")[0],
            source: "landing_hero",
            page_url: window.location.href,
          }),
        }
      );
      setSubmitted(true);
    } catch { setSubmitted(true); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* NAV */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Pulse AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Sign in</Button>
            <Button size="sm" onClick={() => navigate("/register")}>Start free</Button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
          <Sparkles className="h-4 w-4" />
          Business Operating System AI
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6 leading-tight">
          AI that works 24/7<br />
          <span className="text-primary">for your business</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Zero lost leads. Zero forgotten follow-ups. Zero unnecessary manual work.
          Pulse AI manages Instagram, WhatsApp and Facebook — automatically.
        </p>

        {/* CTA */}
        {!submitted ? (
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="you@yourbusiness.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuickSignup()}
              className="flex-1"
            />
            <Button onClick={handleQuickSignup} className="gap-2 whitespace-nowrap">
              Start 7-day free trial <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
            <CheckCircle className="h-5 w-5" />
            Thanks! We'll contact you within 24 hours.
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          No credit card required. Set up in 15 minutes.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mt-16">
          {[["90%", "DMs handled by AI"], ["15 min", "Full onboarding"], ["24/7", "Automated support"]].map(([n, l]) => (
            <div key={l}>
              <div className="text-3xl font-bold text-primary">{n}</div>
              <div className="text-sm text-muted-foreground mt-1">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">What Pulse AI does</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            The only system that learns automatically from your business and starts working within 15 minutes.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card border border-border rounded-xl p-6">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VS COMPETITORS */}
      <section className="py-20 max-w-4xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Why Pulse AI over the others?</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-muted-foreground font-medium">Feature</th>
                {["respond.io\n$299/m", "GoHighLevel\n$97/m", "Pulse AI\n$50/m"].map(n => (
                  <th key={n} className={`text-center py-3 px-4 ${n.includes("Pulse") ? "text-primary font-bold" : "text-muted-foreground font-medium"}`}>
                    {n.split("\n").map((l, i) => <div key={i}>{l}</div>)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["AI Memory", "✗", "✗", "✓"],
                ["Business Scanner", "✗", "✗", "✓"],
                ["Revenue Intelligence", "✗", "✗", "✓"],
                ["Omnichannel AI", "Partial", "✗", "✓"],
                ["15-min onboarding", "✗", "✗", "✓"],
                ["Local market focus", "✗", "✗", "✓"],
              ].map(([f, ...vals]) => (
                <tr key={f} className="border-b border-border/50">
                  <td className="py-3 text-sm text-foreground">{f}</td>
                  {vals.map((v, i) => (
                    <td key={i} className={`text-center py-3 text-sm ${i === 2 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PRICING */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Plans and Pricing</h2>
          <p className="text-muted-foreground text-center mb-12">7 days free. No credit card. Cancel anytime.</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {PLANS.map(plan => (
              <div key={plan.name} className={`bg-card border rounded-xl p-6 ${plan.highlight ? "border-primary shadow-lg shadow-primary/10 relative" : "border-border"}`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-sm text-muted-foreground mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-5">{plan.desc}</div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={() => navigate(plan.name === "Pro" ? "/contact" : "/register")}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 max-w-5xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">What customers say</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="bg-card border border-border rounded-xl p-6">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">"{t.text}"</p>
              <div className="font-semibold text-sm text-foreground">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.biz}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-primary py-20 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-primary-foreground mb-4">
            Ready to get started?
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            7 days free. Set up in 15 minutes. No credit card required.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/register")} className="gap-2">
            Start free now <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Pulse AI</span>
        </div>
        <p>Business Operating System AI · kohablerjeve.top</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-3 text-xs px-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 hover:text-foreground">
              Legal &amp; Trust <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              {LEGAL_LINKS.map((l) => (
                <DropdownMenuItem key={l.href} asChild>
                  <a href={l.href}>{l.label}</a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <a href="mailto:info@mso.re" className="hover:text-foreground">Contact</a>
        </div>

      </footer>

    </div>
  );
}
