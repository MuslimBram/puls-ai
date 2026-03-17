import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useOnboarding, OnboardingStep } from "@/hooks/useOnboarding";
import {
  CheckCircle2,
  Circle,
  Rocket,
  X,
  ArrowRight,
} from "lucide-react";

export const OnboardingWizard = () => {
  const { steps, completionScore, isDismissed, dismiss } = useOnboarding();

  if (isDismissed || completionScore === 100) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-5 w-5 text-primary" />
            Setup Your Platform
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {completionScore}% complete
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => dismiss.mutate()}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Progress value={completionScore} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step) => (
          <OnboardingStepRow key={step.id} step={step} />
        ))}
      </CardContent>
    </Card>
  );
};

const OnboardingStepRow = ({ step }: { step: OnboardingStep }) => (
  <div className="flex items-center gap-3">
    {step.completed ? (
      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
    ) : (
      <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
    )}
    <div className="flex-1 min-w-0">
      <span
        className={`text-sm ${
          step.completed
            ? "text-muted-foreground line-through"
            : "text-foreground font-medium"
        }`}
      >
        {step.label}
      </span>
      {!step.completed && (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {step.description}
        </p>
      )}
    </div>
    {!step.completed && (
      <Link to={step.href}>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
          Fix now <ArrowRight className="h-3 w-3" />
        </Button>
      </Link>
    )}
  </div>
);

