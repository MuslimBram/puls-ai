import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { safeNavigate } from "@/lib/safeNavigate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatALL } from "@/lib/currency";
import { CheckCircle, Circle, ArrowRight, Sparkles, DollarSign } from "lucide-react";

interface SetupData {
  progress: {
    pct: number;
    completed_steps: number;
    total_steps: number;
    current_step: { id: number; title: string; url: string };
    is_complete: boolean;
    completed: number[];
  };
  ai_guidance: string;
  suggested_agents: Array<{ id: string; name: string; reason: string }>;
  costs_transparency: {
    pulse_ai_monthly: number;
    third_party_costs: Record<string, string>;
    note: string;
  };
}

const STEP_TITLES = [
  "Business Profile",
  "Connect Instagram",
  "Connect WhatsApp",
  "AI Scan",
  "Test AI Reply",
  "Configure Channels",
];

export default function AISetupAssistant() {
  const [data, setData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCosts, setShowCosts] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-setup-assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({}),
        });
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!data?.progress) return null;
  const { progress, ai_guidance, suggested_agents, costs_transparency } = data;

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        <header className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Set up Pulse AI</h1>
          <p className="text-muted-foreground mt-1">Ready in under 15 minutes</p>
        </header>

        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress.pct}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>

        <Card className="mb-5 border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{ai_guidance}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2 mb-6">
          {STEP_TITLES.map((title, i) => {
            const id = i + 1;
            const done = progress.completed?.includes(id);
            const isCurrent = progress.current_step?.id === id;
            return (
              <div key={id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isCurrent ? "border-primary/40 bg-primary/5" : done ? "border-green-200 bg-green-50/50" : "border-border"}`}>
                {done
                  ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  : <Circle className={`h-5 w-5 shrink-0 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />}
                <span className={`text-sm flex-1 ${done ? "text-muted-foreground line-through" : isCurrent ? "font-medium" : "text-muted-foreground"}`}>{title}</span>
                {isCurrent && !progress.is_complete && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => safeNavigate(navigate, progress.current_step.url)}>
                    Start<ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {suggested_agents?.length > 0 && (
          <Card className="mb-5">
            <CardContent className="pt-4">
              <h2 className="font-medium text-sm mb-3">Recommended AI agents</h2>
              <div className="space-y-2">
                {suggested_agents.map((a) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <p className="text-xs text-muted-foreground">{a.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-3" size="sm" onClick={() => navigate("/ai-marketplace")}>
                Activate from Marketplace
              </Button>
            </CardContent>
          </Card>
        )}

        {costs_transparency && (
          <>
            <button className="text-xs text-muted-foreground underline mb-4 flex items-center gap-1" onClick={() => setShowCosts(!showCosts)}>
              <DollarSign className="h-3.5 w-3.5" />{showCosts ? "Hide" : "Show"} monthly costs
            </button>
            {showCosts && (
              <Card className="mb-6">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Pulse AI (subscription)</span>
                    <span className="font-semibold">{formatALL(costs_transparency.pulse_ai_monthly)} / month</span>
                  </div>
                  <div className="border-t pt-2">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Third-party costs:</p>
                    {Object.entries(costs_transparency.third_party_costs ?? {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs text-muted-foreground py-0.5">
                        <span>{k}</span><span>{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600">{costs_transparency.note}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {progress.is_complete && (
          <Button className="w-full" size="lg" onClick={() => navigate("/dashboard")}>
            Go to Dashboard<ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
