import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  Target, MessageSquare, BarChart3, Bot, Phone,
  TrendingUp, Globe, Zap, ShieldCheck, Users,
  Mail, LineChart, PieChart, Megaphone,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: Target,
    title: "Capture New Customers",
    points: [
      "Analyze your market & competitors",
      "Discover high-value keywords",
      "Create irresistible offers",
      "Launch targeted campaigns",
    ],
    result: "Your platform becomes a marketing machine.",
  },
  {
    icon: MessageSquare,
    title: "Manage All Communication",
    points: [
      "Reply on WhatsApp, Email & Social",
      "Track phone calls & follow-ups",
      "Unified inbox — one panel for everything",
    ],
    result: "Faster responses. More sales.",
  },
  {
    icon: PieChart,
    title: "Organize Your Sales",
    points: [
      "Build custom sales pipelines",
      "Track & score every lead",
      "Plan automated follow-ups",
      "Predict purchase probability",
    ],
    result: "Professional, data-driven selling.",
  },
  {
    icon: Bot,
    title: "Automate Processes",
    points: [
      "Set up auto-replies",
      "Assign agents automatically",
      "Send offers on triggers",
      "Re-engage lost customers",
    ],
    result: "Save staff. Scale effortlessly.",
  },
  {
    icon: Phone,
    title: "Build a Call Center",
    points: [
      "Make outbound calls",
      "Set up IVR menus",
      "Monitor agent performance",
      "Record & transcribe calls",
    ],
    result: "Enterprise-grade operations.",
  },
  {
    icon: BarChart3,
    title: "Decide With Data",
    points: [
      "See marketing ROI instantly",
      "Identify top-performing products",
      "Spot VIP customers",
      "Detect churn risk early",
    ],
    result: "Intelligent business decisions.",
  },
  {
    icon: Globe,
    title: "Expand to New Markets",
    points: [
      "Analyze new cities & regions",
      "Target fresh segments",
      "Build scale strategies",
    ],
    result: "Real, sustainable growth.",
  },
];

export const BusinessCapabilities = () => (
  <section className="border-t border-border bg-muted/30">
    <div className="container mx-auto px-4 py-20">
      <div className="mb-12 text-center animate-on-scroll">
        <Badge className="mb-3 text-sm">For Businesses</Badge>
        <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
          Everything a Business Needs to Grow
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          From capturing leads to closing deals — one platform replaces your entire marketing, sales, and support stack.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-children">
        {CAPABILITIES.map((cap) => (
          <Card key={cap.title} className="group hover-lift card-glow">
            <CardContent className="pt-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <cap.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-3 font-semibold text-foreground">{cap.title}</h3>
              <ul className="mb-4 space-y-1.5">
                {cap.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Zap className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="text-xs font-medium text-primary">{cap.result}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);
