import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ArrowRight, LayoutDashboard, FileText, Link2, Bot } from "lucide-react";

const TOUR_KEY = "pulse_guided_tour_completed";

interface TourStep {
  icon: React.ElementType;
  title: string;
  desc: string;
  path: string;
}

const STEPS: TourStep[] = [
  {
    icon: LayoutDashboard,
    title: "Welcome! Here's where you start",
    desc: "This is your main dashboard where you can see stats, new messages and upcoming tasks.",
    path: "/dashboard",
  },
  {
    icon: FileText,
    title: "Complete Your Business Profile",
    desc: "Add your name, logo, description and contact information for your business.",
    path: "/business-profile",
  },
  {
    icon: Link2,
    title: "Connect Your Channels",
    desc: "Connect WhatsApp, Telegram, Email or Chat to receive messages in your Inbox.",
    path: "/channels",
  },
  {
    icon: Bot,
    title: "Your AI Is Ready!",
    desc: "AI will learn from your business and respond to customers automatically.",
    path: "/inbox",
  },
];

export const GuidedTour = () => {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(TOUR_KEY, "true");
  };

  const next = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      dismiss();
      navigate(STEPS[STEPS.length - 1].path);
    }
  };

  const goToStep = () => {
    navigate(STEPS[currentStep].path);
  };

  if (!visible) return null;

  const step = STEPS[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 animate-fade-in-up shadow-2xl">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <StepIcon className="h-6 w-6" />
            </div>
            <Button aria-label="Close" variant="ghost" size="icon" onClick={dismiss} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
          <p className="text-sm text-muted-foreground mb-6">{step.desc}</p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={goToStep} className="flex-1">
              Go there
            </Button>
            <Button size="sm" onClick={next} className="flex-1">
              {currentStep < STEPS.length - 1 ? "Next" : "Finish"}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>

          <button
            onClick={dismiss}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
        </CardContent>
      </Card>
    </div>
  );
};
