import type { ReactNode } from "react";
import { Building2, BriefcaseBusiness, Layers3, Rocket } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

export type LeadPlanValue = "standard" | "professional" | "advanced" | "enterprise";

interface PlanOrbitSelectorProps {
  value?: LeadPlanValue | "";
  onChange: (value: LeadPlanValue) => void;
  labels: Record<LeadPlanValue, string>;
}

const ICONS: Record<LeadPlanValue, ReactNode> = {
  standard: <Layers3 className="h-5 w-5" aria-hidden="true" />,
  professional: <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />,
  advanced: <Rocket className="h-5 w-5" aria-hidden="true" />,
  enterprise: <Building2 className="h-5 w-5" aria-hidden="true" />,
};

const DESCRIPTIONS: Record<LeadPlanValue, string> = {
  standard: "Standard plan interest.",
  professional: "Professional plan interest.",
  advanced: "Advanced plan interest.",
  enterprise: "Enterprise plan interest.",
};

const PLAN_ORDER: LeadPlanValue[] = ["standard", "professional", "advanced", "enterprise"];

export function PlanOrbitSelector({ value, onChange, labels }: PlanOrbitSelectorProps) {
  const items: OrbitSelectorItem<LeadPlanValue>[] = PLAN_ORDER.map((plan) => ({
    value: plan,
    label: labels[plan],
    icon: ICONS[plan],
    description: DESCRIPTIONS[plan],
  }));

  return (
    <OrbitSelector
      items={items}
      selectedValue={value || undefined}
      onSelect={onChange}
      ariaLabel="Interested plan"
      rotationInterval={2500}
      centralContent={(focusedItem) => (
        <div className="flex flex-col items-center gap-2 px-3 text-center">
          <div className="text-primary">{focusedItem?.icon}</div>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Plan interest
          </span>
          <span className="text-sm font-semibold text-foreground sm:text-base">
            {focusedItem?.label ?? "Choose plan"}
          </span>
        </div>
      )}
    />
  );
}
