import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { CheckCircle2, Circle, ArrowRight, Rocket, Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";

const stepRoutes: Record<string, string> = {
  business_profile: "/business-profile",
  connect_channel: "/connections",
  import_contacts: "/crm?tab=contacts",
  upload_knowledge: "/knowledge-base",
  create_automation: "/automations",
};

const Onboarding = () => {
  const { steps, completionPct, isComplete } = useOnboardingProgress();
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <Rocket className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Get Started</h1>
          <p className="text-sm text-muted-foreground">Complete these steps to set up your business and unlock full platform capabilities</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Setup Progress</CardTitle>
              <Badge variant={isComplete ? "default" : "secondary"}>{completionPct}% Complete</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={completionPct} className="h-2" />
          </CardContent>
        </Card>

        {isComplete && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Gift className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm font-semibold">🎉 Setup Complete!</p>
                <p className="text-xs text-muted-foreground">Your business is fully configured. Explore the dashboard to grow!</p>
              </div>
              <Button size="sm" className="ml-auto" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {steps.map((step, i) => (
            <Card key={step.key} className={step.completed ? "opacity-70" : ""}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/20">
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {!step.completed && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => navigate(stepRoutes[step.key] || "/dashboard")}>
                    Start <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                {step.completed && <Badge variant="secondary" className="text-[10px]">Done</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Onboarding;
