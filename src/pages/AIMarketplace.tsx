import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  TrendingUp, Megaphone, Headphones, BarChart3, GraduationCap,
  DollarSign, Shield, Zap, CheckCircle,
} from "lucide-react";

const AGENTS = [
  { id: "sales_manager", name: "AI Sales Manager", desc: "Analyzes the pipeline, flags deals at risk and recommends next steps.", icon: TrendingUp, color: "text-green-500", credits: 50, plan: "starter", caps: ["Pipeline analysis", "Deal risk detection", "Follow-up automation"] },
  { id: "marketing_manager", name: "AI Marketing Manager", desc: "Builds a weekly content plan, reviews campaigns and optimizes budget.", icon: Megaphone, color: "text-blue-500", credits: 80, plan: "starter", caps: ["Content calendar", "Campaign optimization", "Hashtag strategy"] },
  { id: "customer_success", name: "AI Customer Success", desc: "Detects churn up to 14 days ahead and proposes automated retention.", icon: Headphones, color: "text-purple-500", credits: 60, plan: "growth", caps: ["Churn prediction", "Upsell detection", "Health scoring"] },
  { id: "ceo_assistant", name: "AI CEO Assistant", desc: "Daily KPI brief with trends and the three priorities of the day.", icon: BarChart3, color: "text-amber-500", credits: 120, plan: "pro", caps: ["Daily KPI brief", "Strategic decisions", "Risk alerts"] },
  { id: "coach", name: "AI Business Coach", desc: "Trains your staff based on real customer conversations.", icon: GraduationCap, color: "text-indigo-500", credits: 40, plan: "growth", caps: ["Staff assessment", "Training plans", "Weekly challenges"] },
  { id: "finance_ai", name: "AI Finance Manager", desc: "Monitors cash flow, generates invoices and warns about due payments.", icon: DollarSign, color: "text-emerald-500", credits: 70, plan: "pro", caps: ["Cash flow", "Auto-invoicing", "Payment reminders"] },
  { id: "security_ai", name: "AI Security Monitor", desc: "Monitors logins, devices and unusual activity 24/7.", icon: Shield, color: "text-red-500", credits: 20, plan: "enterprise", caps: ["Login monitoring", "Threat detection", "Anomaly alerts"] },
];

const planOrder = ["free", "starter", "growth", "pro", "agency", "enterprise", "ultimate"];

export default function AIMarketplace() {
  const [plan, setPlan] = useState("starter");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: sub } = await supabase
        .from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
      setPlan(sub?.plan ?? "starter");
      const { data: tasks } = await supabase
        .from("ai_agent_tasks").select("agent_name")
        .eq("workspace_id", user.id).eq("status", "completed").limit(100);
      setActive(new Set((tasks ?? []).map((t: { agent_name: string }) => t.agent_name)));
      setLoading(false);
    })();
  }, []);

  const canUse = (p: string) => planOrder.indexOf(plan) >= planOrder.indexOf(p);

  const toggle = async (id: string, isActive: boolean) => {
    const agent = AGENTS.find((a) => a.id === id);
    if (!agent) return;
    if (!canUse(agent.plan)) {
      toast({ title: `Requires the ${agent.plan} plan`, variant: "destructive" });
      return;
    }
    setToggling(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (!isActive) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/multi-agent-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ agent: id, input: "Activated from Marketplace" }),
        });
        toast({ title: `${agent.name} activated` });
        setActive((prev) => new Set([...prev, id]));
      } else {
        toast({ title: `${agent.name} deactivated` });
        setActive((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />AI Marketplace
          </h1>
          <p className="text-muted-foreground mt-1">
            Activate AI agents with one click. Each one works automatically, 24/7.
          </p>
        </header>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map((ag) => {
            const Icon = ag.icon;
            const isActive = active.has(ag.id);
            const available = canUse(ag.plan);
            return (
              <Card key={ag.id} className={`relative transition-all ${!available ? "opacity-60" : ""} ${isActive ? "border-primary/40 bg-primary/5" : ""}`}>
                {isActive && <div className="absolute top-3 right-3 h-2 w-2 bg-green-500 rounded-full animate-pulse" />}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center">
                      <Icon className={`h-5 w-5 ${ag.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{ag.name}</CardTitle>
                      {!available && <Badge variant="outline" className="text-[10px] mt-0.5">{ag.plan}+</Badge>}
                    </div>
                    <Switch checked={isActive} onCheckedChange={() => toggle(ag.id, isActive)} disabled={!!toggling || !available} aria-label={`Toggle ${ag.name}`} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{ag.desc}</p>
                  <div className="space-y-1">
                    {ag.caps.map((c) => (
                      <div key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />{c}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">{ag.credits} credits/run</span>
                    {isActive && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={toggling === ag.id} onClick={() => toggle(ag.id, false)}>
                        {toggling === ag.id ? "..." : "Deactivate"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
