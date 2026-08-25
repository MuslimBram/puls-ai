import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe, Users, Briefcase, MessageSquare, Shield, Heart,
  Zap, ArrowRight, CheckCircle2, Star
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export default function LidhjetPublic() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const features = [
    {
      icon: Globe,
      title: "Connect with Your Community",
      desc: "Find people, businesses, and opportunities in your local market."
    },
    {
      icon: Briefcase,
      title: "Discover Opportunities",
      desc: "Post services, hire freelancers, trade products, and grow your network."
    },
    {
      icon: MessageSquare,
      title: "Direct Collaboration",
      desc: "Message with sellers, buyers, and service providers directly."
    },
    {
      icon: Shield,
      title: "Safe & Verified",
      desc: "AI-moderated community with verified profiles and trusted interactions."
    },
    {
      icon: Users,
      title: "Build Your Reputation",
      desc: "Ratings, reviews, and verified credentials to build trust."
    },
    {
      icon: Heart,
      title: "Always Free",
      desc: "No hidden fees. No commission. Just real connections and opportunity."
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Lidhjet</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login?source=lidhjet")}>{t("landing.signIn")}</Button>
            <Button size="sm" onClick={() => navigate("/register?source=lidhjet")}>{t("landing.getStarted")}</Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <Badge className="mb-4 inline-flex items-center gap-2">
          <Globe className="h-3 w-3" />
          Community Marketplace
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6 leading-tight">
          Connect. Trade. Grow.<br />
          <span className="text-primary">Your Community, Your Way</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Lidhjet is where people and businesses meet, collaborate, and create opportunities together.
          No middlemen. No commissions. Just real connections.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Button size="lg" onClick={() => navigate("/register?source=lidhjet")} className="gap-2">
            {t("landing.getStarted")} <ArrowRight className="h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/login?source=lidhjet")} className="gap-2">
            {t("landing.signIn")} <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Always free. No credit card required.
        </p>

        <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mt-16">
          {[["", ""], ["", ""], ["", ""]].map(([num, label]) => (
            <div key={label}>
              <div className="text-sm text-muted-foreground mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/30 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Why Join Lidhjet?</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Real people. Real opportunities. Real growth.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 max-w-5xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6 text-center">
          {[
            { num: "01", title: "Create Profile", desc: "Sign up for free in 2 minutes" },
            { num: "02", title: "Build Your Story", desc: "Add your skills, services, or interests" },
            { num: "03", title: "Connect", desc: "Find people and opportunities around you" },
            { num: "04", title: "Collaborate", desc: "Message, trade, and grow together" },
          ].map(({ num, title, desc }) => (
            <div key={num} className="space-y-3">
              <div className="text-4xl font-bold text-primary">{num}</div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Ready to Join Your Community?
          </h2>
          <p className="text-muted-foreground mb-8">
            Start connecting with real people and real opportunities today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/register?source=lidhjet")} className="gap-2">
              {t("landing.getStarted")} <ArrowRight className="h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/login?source=lidhjet")} className="gap-2">
              {t("landing.signIn")} <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Lidhjet</span>
        </div>
        <p>© 2024 Lidhjet - Community Marketplace</p>
      </footer>
    </div>
  );
}
