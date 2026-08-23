import type { ReactNode } from "react";
import { CalendarCheck2, CalendarClock, CalendarDays, CalendarRange } from "lucide-react";
import { OrbitSelector, LiveDigitalClock, type OrbitSelectorItem } from "@/components/OrbitSelector";
import { PACKAGE_VARIANTS } from "@/config/plans";
import type { PackageVariant } from "@/types/monetization";

interface PricingDurationSelectorProps {
  value: PackageVariant["type"];
  onChange: (value: PackageVariant["type"]) => void;
}

const ICONS: Record<PackageVariant["type"], ReactNode> = {
  monthly: <CalendarDays className="h-5 w-5" aria-hidden="true" />,
  "3-month": <CalendarClock className="h-5 w-5" aria-hidden="true" />,
  "6-month": <CalendarRange className="h-5 w-5" aria-hidden="true" />,
  yearly: <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />,
};

export const PricingDurationSelector = ({ value, onChange }: PricingDurationSelectorProps) => {
  const items: OrbitSelectorItem<PackageVariant["type"]>[] = PACKAGE_VARIANTS.map((variant) => ({
    value: variant.type,
    label: variant.label,
    icon: ICONS[variant.type],
    description:
      variant.durationMonths === 1
        ? "Pay monthly with no commitment discount."
        : `${variant.durationMonths}-month commitment · save ${variant.discountPercent}%.`,
  }));

  return (
    <OrbitSelector
      items={items}
      selectedValue={value}
      onSelect={onChange}
      ariaLabel="Commitment term"
      rotationInterval={2500}
      centralContent={(focusedItem) => (
        <div className="flex flex-col items-center gap-2 px-2 text-center">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Local time
          </span>
          <LiveDigitalClock />
          <span className="text-xs font-semibold text-foreground">
            {focusedItem?.label ?? "Choose term"}
          </span>
        </div>
      )}
    />
  );
};
