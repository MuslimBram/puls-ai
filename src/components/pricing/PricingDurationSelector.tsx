import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PACKAGE_VARIANTS } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { PackageVariant } from "@/types/monetization";

interface PricingDurationSelectorProps {
  value: PackageVariant["type"];
  onChange: (value: PackageVariant["type"]) => void;
}

export const PricingDurationSelector = ({ value, onChange }: PricingDurationSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {PACKAGE_VARIANTS.map((variant) => (
        <Button
          key={variant.type}
          type="button"
          variant={value === variant.type ? "default" : "outline"}
          className={cn("h-auto min-w-[110px] flex-col items-start gap-1 px-4 py-3 text-left", value === variant.type && "shadow-sm")}
          onClick={() => onChange(variant.type)}
        >
          <span className="text-sm font-medium">{variant.label}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{variant.durationMonths === 1 ? "Pay monthly" : `${variant.durationMonths}-month term`}</span>
            {variant.discountPercent > 0 ? <Badge variant="secondary" className="px-2 py-0 text-[10px]">-{variant.discountPercent}%</Badge> : null}
          </div>
        </Button>
      ))}
    </div>
  );
};
