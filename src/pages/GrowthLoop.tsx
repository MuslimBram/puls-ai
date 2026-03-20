import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGrowthLoop } from "@/hooks/useGrowthLoop";
import { RefreshCw, TrendingUp, Users, Rocket, ArrowRight } from "lucide-react";

const GrowthLoop = () => {
  const { metrics, latest, viralCoefficient, isLoading } = useGrowthLoop();

  const stages = [
    { label: "Referral", value: latest?.referral_count ?? 0, icon: Users },
    { label: "Onboarding", value: latest?.onboarding_completions ?? 0, icon: Rocket },
    { label: "Activation", value: latest?.activations ?? 0, icon: TrendingUp },
    { label: "Upgrade", value: latest?.upgrades ?? 0, icon: TrendingUp },
    { label: "Advocacy", value: latest?.advocates ?? 0, icon: Users },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Autonomous Growth Loop Engine</h1>
          <p className="text-muted-foreground">Track the full growth flywheel: referral → onboarding → activation → upgrade → advocacy.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-4 text-center">
            <RefreshCw className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{viralCoefficient.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Viral Coefficient</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{Number(latest?.loop_velocity_days ?? 0).toFixed(1)}d</p>
            <p className="text-xs text-muted-foreground">Loop Velocity</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Badge variant={viralCoefficient >= 1 ? "default" : "secondary"} className="text-sm">
              {viralCoefficient >= 1 ? "Viral Growth 🚀" : "Sub-Viral"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">K &ge; 1 = viral</p>
          </CardContent></Card>
        </div>

        {/* Growth Loop Visualization */}
        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-foreground mb-4">Growth Flywheel</h3>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {stages.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="text-center rounded-lg border border-border p-4 min-w-[100px]">
                    <s.icon className="h-5 w-5 mx-auto text-primary mb-1" />
                    <p className="text-lg font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                  {i < stages.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Optimization Suggestions */}
        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold text-foreground mb-3">Optimization Suggestions</h3>
            {latest?.optimization_suggestions && Array.isArray(latest.optimization_suggestions) && (latest.optimization_suggestions as any[]).length > 0 ? (
              <div className="space-y-2">
                {(latest.optimization_suggestions as any[]).map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Rocket className="h-4 w-4 text-primary" />
                    <span className="text-foreground">{typeof s === "string" ? s : s.text ?? JSON.stringify(s)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Suggestions will appear as loop data accumulates.</p>
            )}
          </CardContent>
        </Card>

        {/* Historical Metrics */}
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.slice(0, 6).map(m => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <p className="text-sm font-medium text-foreground mb-2">{m.metric_date}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div><p className="text-lg font-bold">{m.referral_count}</p><p className="text-muted-foreground">Referrals</p></div>
                  <div><p className="text-lg font-bold">{m.activations}</p><p className="text-muted-foreground">Activations</p></div>
                  <div><p className="text-lg font-bold">{Number(m.viral_coefficient).toFixed(2)}</p><p className="text-muted-foreground">K-factor</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default GrowthLoop;
