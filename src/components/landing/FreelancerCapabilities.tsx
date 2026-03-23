import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign, Wrench, Megaphone, Headphones,
  Building2, Globe, Zap, TrendingUp,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: DollarSign,
    title: "Earn Sales Commissions",
    points: [
      "Bring businesses to the platform",
      "Use your unique referral link",
      "Earn recurring monthly commissions",
    ],
    result: "Build passive income streams.",
  },
  {
    icon: Wrench,
    title: "Offer Setup Services",
    points: [
      "Connect WhatsApp & channels for clients",
      "Build automations & workflows",
      "Create campaigns & funnels",
    ],
    result: "Commission + service fees = double income.",
  },
  {
    icon: Megaphone,
    title: "Manage Client Marketing",
    points: [
      "Create & optimize campaigns",
      "Analyze performance data",
      "Refine growth strategies",
    ],
    result: "Become a growth manager.",
  },
  {
    icon: Headphones,
    title: "Run Inbox & Call Centers",
    points: [
      "Respond on behalf of businesses",
      "Track & qualify leads",
      "Close sales remotely",
    ],
    result: "A new digital role — from anywhere.",
  },
  {
    icon: Building2,
    title: "Build a Mini Agency",
    points: [
      "Onboard multiple businesses",
      "Grow your team",
      "Manage a client portfolio",
    ],
    result: "Become a certified platform partner.",
  },
  {
    icon: Globe,
    title: "Open New Markets",
    points: [
      "Sell the platform in new cities & countries",
      "Become a regional reseller",
      "Build a partner network",
    ],
    result: "True scale — unlimited potential.",
  },
];

export const FreelancerCapabilities = () => (
  <section className="border-t border-border">
    <div className="container mx-auto px-4 py-20">
      <div className="mb-12 text-center">
        <Badge variant="secondary" className="mb-3 text-sm">For Freelancers & Partners</Badge>
        <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
          Turn the Platform Into Your Business
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Become a sales arm, marketing arm, and support arm — all at once. Scale from freelancer to agency partner.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((cap) => (
          <Card key={cap.title} className="group transition-all hover:border-primary/40 hover:shadow-lg">
            <CardContent className="pt-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <cap.icon className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="mb-3 font-semibold text-foreground">{cap.title}</h3>
              <ul className="mb-4 space-y-1.5">
                {cap.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
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
