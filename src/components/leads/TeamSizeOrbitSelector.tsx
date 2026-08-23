import type { ReactNode } from "react";
import { Building2, Building, Users, UserRound, UsersRound } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

export type TeamSizeValue = "1" | "2-5" | "6-15" | "16-50" | "50+";

interface TeamSizeOrbitSelectorProps {
  value?: TeamSizeValue | "";
  onChange: (value: TeamSizeValue) => void;
  labels: Record<TeamSizeValue, string>;
}

const ICONS = {
  "1": <UserRound className="h-5 w-5" aria-hidden="true" />,
  "2-5": <Users className="h-5 w-5" aria-hidden="true" />,
  "6-15": <UsersRound className="h-5 w-5" aria-hidden="true" />,
  "16-50": <Building className="h-5 w-5" aria-hidden="true" />,
  "50+": <Building2 className="h-5 w-5" aria-hidden="true" />,
} satisfies Record<TeamSizeValue, ReactNode>;

const DESCRIPTIONS: Record<TeamSizeValue, string> = {
  "1": "Solo business or independent operator.",
  "2-5": "Small team with a few collaborators.",
  "6-15": "Growing team with shared workflows.",
  "16-50": "Established business with multiple roles.",
  "50+": "Larger organization with broader coordination needs.",
};

export function TeamSizeOrbitSelector({ value, onChange, labels }: TeamSizeOrbitSelectorProps) {
  const items: OrbitSelectorItem<TeamSizeValue>[] = (Object.keys(labels) as TeamSizeValue[]).map((teamSize) => ({
    value: teamSize,
    label: labels[teamSize],
    icon: ICONS[teamSize],
    description: DESCRIPTIONS[teamSize],
  }));

  return (
    <OrbitSelector
      items={items}
      selectedValue={value || undefined}
      onSelect={onChange}
      ariaLabel="Team size"
      rotationInterval={2500}
      centralContent={(focusedItem) => (
        <div className="flex flex-col items-center gap-2 px-3 text-center">
          <div className="text-primary">{focusedItem?.icon}</div>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Team size
          </span>
          <span className="text-sm font-semibold text-foreground sm:text-base">
            {focusedItem?.label ?? "Choose size"}
          </span>
        </div>
      )}
    />
  );
}
