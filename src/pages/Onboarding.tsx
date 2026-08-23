import { useMemo, useState, type ReactNode } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { ArrowRight, Bot, CheckCircle2, Gift, Rocket, Settings2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const stepRoutes: Record<string, string> = {
  business_profile: "/business-profile",
  connect_channel: "/connections",
  // Legacy key retained for stored progress compatibility; the implemented action is creating a CRM deal.
  import_contacts: "/crm?tab=pipeline",
  upload_knowledge: "/knowledge-base",
  create_automation: "/automations",
};

const stepIcons: Record<string, ReactNode> = {
  business_profile: <Settings2 className="h-5 w-5" />,
  connect_channel: <Sparkles className="h-5 w-5" />,
  import_contacts: <Bot className="h-5 w-5" />,
  upload_knowledge: <Sparkles className="h-5 w-5" />,
  create_automation: <Bot className="h-5 w-5" />,
};

const Onboarding = () => {
  const { steps, completionPct, isComplete } = useOnboardingProgress();
  const navigate = useNavigate();
  const [selectedStep, setSelectedStep] = useState<string>();

  const openSteps = useMemo<OrbitSelectorItem[]>(
    () => steps
      .filter((step) => !step.completed)
      .map((step) => ({
        value: step.key,
        label: step.label,
        description: step.description,
        icon: stepIcons[step.key] ?? <Rocket className="h-5 w-5" />,
      })),
    [steps],
  );

  const selectedOpenStep = openSteps.find((step) => step.value === selectedStep);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <Rocket className="mx-auto h-10 w-10 text-primary" />
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

        {!isComplete && openSteps.length > 0 && (
          <section className="space-y-3" aria-labelledby="choose-next-step">
            <div className="text-center">
              <h2 id="choose-next-step" className="text-lg font-semibold">Choose what to set up next</h2>
              <p className="text-xs text-muted-foreground">Options rotate automatically. Nothing is selected until you click it.</p>
            </div>

            <OrbitSelector
              ariaLabel="Onboarding setup choices"
              items={openSteps}
              selectedValue={selectedStep}
              onSelect={setSelectedStep}
              rotationInterval={2500}
              centralContent={(item) => (
                <div className="flex flex-col items-center gap-2 px-3 text-center">
                  <div className="text-primary">{item?.icon}</div>
                  <span className="text-xs font-semibold sm:text-sm">{item?.label}</span>
                </div>
              )}
            />

            <div className="flex justify-center">
              <Button
                disabled={!selectedOpenStep}
                className="gap-2"
                onClick={() => selectedOpenStep && navigate(stepRoutes[selectedOpenStep.value] || "/dashboard")}
              >
                {selectedOpenStep ? `Start: ${selectedOpenStep.label}` : "Select an option"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
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
