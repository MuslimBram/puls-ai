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
  Instagram, Inbox, Sparkles, Target, TrendingUp
} from "lucide-react";

const FEATURES = [
  { icon: Inbox, title: "Inbox i Unifikuar", desc: "WhatsApp, Instagram, Facebook, SMS — gjithçka në 1 vend. AI përgjigjet 24/7." },
  { icon: Brain, title: "AI me Memorie", desc: "Mëson çmimet, produktet, FAQ nga postimet tuaja. Pa konfigurim manual." },
  { icon: Target, title: "Lead Capture Automatik", desc: "Çdo DM, çdo koment → lead automatik → CRM → follow-up pa ndërhyrje." },
  { icon: TrendingUp, title: "Revenue Intelligence", desc: "Lead scoring, churn prediction, upsell automatik. Di kur klienti është gati." },
  { icon: BarChart3, title: "CEO Dashboard Live", desc: "Leads, Revenue, Ads, Thirrje, KPI — gjithçka live në 1 dashboard." },
  { icon: Shield, title: "Siguri Enterprise", desc: "Device Trust AI, AES-GCM encryption, aprovim admin për pajisje të reja." },
];

const PLANS = [
  {
    name: "Starter", price: "50€", period: "/muaj",
    desc: "Për biznese të vogla",
    features: ["1 kanal (IG ose WA)", "1,000 mesazhe AI/muaj", "CRM bazik", "Dashboard"],
    cta: "Fillo falas 7 ditë", highlight: false,
  },
  {
    name: "Growth", price: "70€", period: "/muaj",
    desc: "Për biznese në rritje",
    features: ["3 kanale (IG+WA+FB)", "5,000 mesazhe AI/muaj", "Revenue Intelligence", "Sequences automatike", "Email campaigns", "Rezervimet online"],
    cta: "Fillo falas 7 ditë", highlight: true,
  },
  {
    name: "Pro", price: "120€", period: "/muaj",
    desc: "Për agjenci dhe ekipe",
    features: ["Kanale të pakufizuara", "20,000 mesazhe AI/muaj", "CEO Dashboard live", "Ads sync (Meta+Google)", "Fatura PDF + Kontrata", "Business Memory Engine", "Partner program"],
    cta: "Kontakto për demo", highlight: false,
  },
];

const TESTIMONIALS = [
  { name: "Erjona K.", biz: "Salon Bukurie, Tiranë", text: "Para Pulse AI kisha 50 DM të pavarura çdo ditë. Tani AI i trajton 90% automatikisht dhe unë fokusohem tek puna reale.", stars: 5 },
  { name: "Artan M.", biz: "Restorant, Vlorë", text: "Rezervimet tani bëhen vetë. Klientët rezervojnë nga Instagram direkt dhe marrin kujtesë automatike. 0 rezervime të humbura.", stars: 5 },
  { name: "Blerim H.", biz: "Gym, Durrës", text: "Revenue Intelligence më tregon kush do të largohet 2 javë para. Kurrë s'e kisha këtë informacion. Kursej 3-4 anëtarë/muaj.", stars: 5 },
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
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Kyçu</Button>
            <Button size="sm" onClick={() => navigate("/register")}>Fillo falas</Button>
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
          AI që punon 24/7<br />
          <span className="text-primary">për biznesin tuaj</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          0 leads të humbur. 0 follow-up të harruara. 0 punë manuale të panevojshme.
          Pulse AI menaxhon Instagram, WhatsApp dhe Facebook — automatikisht.
        </p>

        {/* CTA */}
        {!submitted ? (
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="emaili@biznesijuaj.al"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuickSignup()}
              className="flex-1"
            />
            <Button onClick={handleQuickSignup} className="gap-2 whitespace-nowrap">
              Fillo falas 7 ditë <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
            <CheckCircle className="h-5 w-5" />
            Faleminderit! Do t'ju kontaktojmë brenda 24 orëve.
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Pa kartë krediti. Konfigurohesh brenda 15 minutave.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mt-16">
          {[["90%", "DM të trajtuar nga AI"], ["15 min", "Onboarding i plotë"], ["24/7", "Support automatik"]].map(([n, l]) => (
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
          <h2 className="text-3xl font-bold text-center mb-4">Çfarë bën Pulse AI</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Sistemi i vetëm që mëson automatikisht nga biznesi juaj dhe fillon të punojë brenda 15 minutave.
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
        <h2 className="text-3xl font-bold text-center mb-12">Pse Pulse AI dhe jo të tjerët?</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-muted-foreground font-medium">Funksioni</th>
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
                ["Omnichannel AI", "Pjesërisht", "✗", "✓"],
                ["Onboarding 15 min", "✗", "✗", "✓"],
                ["Shqip/Treg lokal", "✗", "✗", "✓"],
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
          <h2 className="text-3xl font-bold text-center mb-4">Planet dhe Çmimet</h2>
          <p className="text-muted-foreground text-center mb-12">7 ditë falas. Pa kartë krediti. Anulo kurdo.</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {PLANS.map(plan => (
              <div key={plan.name} className={`bg-card border rounded-xl p-6 ${plan.highlight ? "border-primary shadow-lg shadow-primary/10 relative" : "border-border"}`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    MÊ I POPULLARIZUAR
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
        <h2 className="text-3xl font-bold text-center mb-12">Çfarë thonë klientët</h2>
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
            Gati të filloni?
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            7 ditë falas. Konfigurohesh brenda 15 minutave. Pa kartë krediti.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/register")} className="gap-2">
            Fillo falas tani <ArrowRight className="h-5 w-5" />
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
        <div className="flex gap-4 justify-center mt-3 text-xs">
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/contact" className="hover:text-foreground">Kontakt</a>
        </div>
      </footer>
    </div>
  );
}
