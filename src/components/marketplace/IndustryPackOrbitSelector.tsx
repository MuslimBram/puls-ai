import { BriefcaseBusiness } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";
import type { IndustryPack } from "@/hooks/useIndustryPacks";

interface IndustryPackOrbitSelectorProps {
  packs: IndustryPack[];
  selectedPackId?: string;
  onSelect: (pack: IndustryPack) => void;
}

export function IndustryPackOrbitSelector({ packs, selectedPackId, onSelect }: IndustryPackOrbitSelectorProps) {
  const items: OrbitSelectorItem<string>[] = packs.map((pack) => ({
    value: pack.id,
    label: pack.name,
    icon: <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />,
    description: pack.description || pack.industry,
  }));

  if (packs.length === 0) return null;

  return (
    <OrbitSelector
      items={items}
      selectedValue={selectedPackId}
      onSelect={(packId) => {
        const pack = packs.find((candidate) => candidate.id === packId);
        if (pack) onSelect(pack);
      }}
      ariaLabel="Industry starter packs"
      rotationInterval={2500}
      centralContent={(focusedItem) => {
        const pack = packs.find((candidate) => candidate.id === focusedItem?.value);
        return (
          <div className="flex flex-col items-center gap-2 px-3 text-center">
            <BriefcaseBusiness className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Industry pack
            </span>
            <span className="text-sm font-semibold text-foreground sm:text-base">
              {pack?.industry || focusedItem?.label || "Explore packs"}
            </span>
          </div>
        );
      }}
    />
  );
}
