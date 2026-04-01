import { Badge } from "@/components/ui/badge";
import {
  Globe, BarChart3, Smartphone, ShoppingBag, TrendingUp,
  Monitor, Search, Brain, Wrench, BookOpen,
} from "lucide-react";

const INTELLIGENCE_CATEGORIES = [
  {
    title: "Rankings",
    items: [
      { icon: Globe, label: "Top Websites" },
      { icon: Smartphone, label: "Top Android & iOS Apps" },
      { icon: ShoppingBag, label: "Top Amazon Products" },
      { icon: TrendingUp, label: "Digital 100" },
      { icon: Monitor, label: "Mobile vs. Desktop" },
    ],
  },
  {
    title: "Solutions",
    items: [
      { icon: Globe, label: "Web Intelligence" },
      { icon: Smartphone, label: "App Intelligence" },
      { icon: ShoppingBag, label: "Retail Intelligence" },
      { icon: BarChart3, label: "Sales Intelligence" },
      { icon: TrendingUp, label: "Stock Intelligence" },
    ],
  },
  {
    title: "Free Tools",
    items: [
      { icon: Search, label: "Website Traffic Checker" },
      { icon: Brain, label: "AI Traffic Checker" },
      { icon: BarChart3, label: "Free App Analytics" },
      { icon: Wrench, label: "Keyword Generator" },
      { icon: TrendingUp, label: "SERP Seismometer" },
    ],
  },
  {
    title: "Resources",
    items: [
      { icon: BookOpen, label: "Blog & Reports" },
      { icon: Monitor, label: "Webinars & Events" },
      { icon: Brain, label: "Knowledge Center" },
      { icon: BarChart3, label: "Data Insights" },
    ],
  },
];

export const IntelligenceToolsSection = () => (
  <section className="border-t border-border bg-muted/30">
    <div className="container mx-auto px-4 py-16">
      <div className="mb-10 text-center animate-on-scroll">
        <Badge variant="secondary" className="mb-3">Intelligence</Badge>
        <h2 className="mb-2 text-3xl font-bold text-foreground">Market Intelligence & Analytics</h2>
        <p className="mx-auto max-w-lg text-muted-foreground">
          Deep insights into websites, apps, markets, and competitors — all powered by AI.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        {INTELLIGENCE_CATEGORIES.map((cat) => (
          <div key={cat.title} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{cat.title}</h3>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-lg border border-border/50 p-2.5 hover-lift">
                  <item.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
