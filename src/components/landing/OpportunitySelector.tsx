import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Target, MessageSquare, BarChart3, Zap, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OpportunityOption {
  id: string;
  icon: any;
  label: string;
  title: string;
  description: string;
  details: string;
  cta: string;
  ctaAction?: () => void;
}

const OPPORTUNITIES: OpportunityOption[] = [
  {
    id: "capture",
    icon: Target,
    label: "Capture",
    title: "Capture New Customers",
    description: "Turn browsers into buyers",
    details: "Every search, every message, every conversation is an opportunity. Pulse AI analyzes your market, finds high-intent prospects, and delivers them pre-qualified to your inbox.",
    cta: "Start Capturing",
  },
  {
    id: "manage",
    icon: MessageSquare,
    label: "Manage",
    title: "Manage All Communication",
    description: "Never miss a message again",
    details: "WhatsApp, Instagram, Email, SMS — all unified in one panel. AI replies instantly 24/7 while you stay in control. One thread. One conversation. No chaos.",
    cta: "Unify Now",
  },
  {
    id: "analyze",
    icon: BarChart3,
    label: "Analyze",
    title: "Analyze & Decide",
    description: "Data beats guessing",
    details: "See exactly which customers are hot, which are at risk, and which are about to churn. Know your numbers. Make smart decisions. Stop guessing.",
    cta: "See Your Data",
  },
  {
    id: "automate",
    icon: Zap,
    label: "Automate",
    title: "Automate Everything",
    description: "Scale without hiring",
    details: "Follow-ups. Offers. Reminders. Handoffs. All triggered automatically. Your team sells and builds. The system handles the rest.",
    cta: "Automate Now",
  },
];

interface OpportunitySelectorProps {
  onActionClick?: (opportunityId: string) => void;
}

export const OpportunitySelector = ({ onActionClick }: OpportunitySelectorProps) => {
  const [activeId, setActiveId] = useState(OPPORTUNITIES[0].id);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const autoRotateTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Auto-rotate functionality
  useEffect(() => {
    if (!isAutoRotating || prefersReducedMotion.current) return;

    autoRotateTimer.current = setInterval(() => {
      setActiveId((prev) => {
        const currentIndex = OPPORTUNITIES.findIndex((o) => o.id === prev);
        const nextIndex = (currentIndex + 1) % OPPORTUNITIES.length;
        return OPPORTUNITIES[nextIndex].id;
      });
    }, 5000);

    return () => {
      if (autoRotateTimer.current) clearInterval(autoRotateTimer.current);
    };
  }, [isAutoRotating]);

  const handleMouseEnter = () => setIsAutoRotating(false);
  const handleMouseLeave = () => setIsAutoRotating(true);
  const handleOptionClick = (id: string) => {
    setActiveId(id);
    setIsAutoRotating(false);
    onActionClick?.(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOptionClick(id);
    }
  };

  useEffect(() => {
    const handlePageVisibility = () => {
      if (document.hidden) {
        setIsAutoRotating(false);
      } else {
        setIsAutoRotating(true);
      }
    };

    document.addEventListener("visibilitychange", handlePageVisibility);
    return () => document.removeEventListener("visibilitychange", handlePageVisibility);
  }, []);

  const activeOption = OPPORTUNITIES.find((o) => o.id === activeId);

  return (
    <div
      ref={containerRef}
      className="w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Desktop Layout */}
      <div className="hidden md:block">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
            {/* Left: Central Icon + Four Option Controls */}
            <div className="lg:col-span-1 flex flex-col items-center">
              {/* Central Icon - Simple, No Circles */}
              <div className="mb-12 flex items-center justify-center">
                <Zap className="h-16 w-16 text-primary" />
              </div>

              {/* Four Option Controls in a vertical stack */}
              <div className="w-full space-y-3" role="group" aria-label="Opportunity options">
                {OPPORTUNITIES.map((option, idx) => (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option.id)}
                    onKeyDown={(e) => handleKeyDown(e, option.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200",
                      "text-left text-sm font-medium",
                      activeId === option.id
                        ? "border-primary bg-primary/10 text-foreground shadow-md"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                    )}
                    aria-selected={activeId === option.id}
                    aria-label={`${option.label}: ${option.title}`}
                  >
                    <option.icon className="h-5 w-5 flex-shrink-0" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Active Content Card */}
            <div className="lg:col-span-2 flex items-center justify-center">
              {activeOption && (
                <Card className="border-2 border-primary/50 overflow-hidden w-full animate-fade-in-up">
                  <CardContent className="pt-8">
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10 flex-shrink-0">
                          <activeOption.icon className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-foreground mb-2">
                            {activeOption.title}
                          </h3>
                          <p className="text-muted-foreground leading-relaxed">
                            {activeOption.details}
                          </p>
                        </div>
                      </div>
                      <Button size="lg" className="gap-2">
                        {activeOption.cta} <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden px-4 py-8">
        <div className="space-y-6">
          {/* Central Icon - Simple */}
          <div className="flex justify-center">
            <Zap className="h-12 w-12 text-primary" />
          </div>

          {/* Option Tabs in Grid */}
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Opportunity options">
            {OPPORTUNITIES.map((option) => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option.id)}
                onKeyDown={(e) => handleKeyDown(e, option.id)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary",
                  activeId === option.id
                    ? "border-primary bg-primary/10 scale-100"
                    : "border-border bg-card hover:border-primary/50"
                )}
                aria-selected={activeId === option.id}
                aria-label={`${option.label}: ${option.title}`}
              >
                <option.icon className={cn(
                  "h-5 w-5 transition-colors",
                  activeId === option.id ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-[10px] font-medium text-center leading-tight transition-colors",
                  activeId === option.id ? "text-primary" : "text-muted-foreground"
                )}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>

          {/* Active Content Card */}
          {activeOption && (
            <Card className="border-2 border-primary/50">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                        <activeOption.icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground">
                        {activeOption.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {activeOption.details}
                    </p>
                  </div>
                  <Button size="sm" className="w-full gap-2 text-xs">
                    {activeOption.cta} <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
