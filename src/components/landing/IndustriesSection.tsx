import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, Cloud, Smartphone, Target, Briefcase,
  Shield, Building2, Scale,
} from "lucide-react";

const INDUSTRIES = [
  { icon: ShoppingCart, label: "E-Commerce", desc: "Boost online sales with AI-powered product videos and ads." },
  { icon: Cloud, label: "SaaS", desc: "Reduce churn and increase conversions with smart automation." },
  { icon: Smartphone, label: "Mobile Apps", desc: "Drive app installs with AI-generated creatives." },
  { icon: Target, label: "Lead Generation", desc: "Qualify and convert leads faster with AI scoring." },
  { icon: Briefcase, label: "Marketing Agencies", desc: "Scale client campaigns with white-label AI tools." },
  { icon: Shield, label: "Insurance", desc: "Automate client communication and policy renewals." },
  { icon: Building2, label: "Real Estate", desc: "Generate property showcases and virtual tours." },
  { icon: Scale, label: "Law Firms", desc: "Streamline client intake and case communication." },
];

export const IndustriesSection = () => (
  <section className="border-t border-border">
    <div className="container mx-auto px-4 py-16">
      <div className="mb-10 text-center animate-on-scroll">
        <Badge variant="secondary" className="mb-3">Industries</Badge>
        <h2 className="mb-2 text-3xl font-bold text-foreground">Built for Every Industry</h2>
        <p className="mx-auto max-w-lg text-muted-foreground">
          Tailored AI solutions for your specific business needs.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        {INDUSTRIES.map((ind) => (
          <div key={ind.label} className="rounded-xl border border-border p-5 hover-lift card-glow text-center">
            <ind.icon className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h3 className="mb-1 font-semibold text-foreground">{ind.label}</h3>
            <p className="text-xs text-muted-foreground">{ind.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
