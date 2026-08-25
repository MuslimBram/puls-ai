import { Building2, Briefcase, Palette, Sparkles, Users } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

type AccountTypeValue = "business" | "freelancer" | "ambassador" | "white_label";

type AccountTypeOrbitSelectorProps = {
  value: AccountTypeValue | null;
  onChange: (value: AccountTypeValue) => void;
};

const ACCOUNT_TYPES: OrbitSelectorItem<AccountTypeValue>[] = [
  { value: "business", label: "Business", icon: <Building2 className="h-6 w-6" />, description: "Manage your business — inbox, CRM, marketing, AI, telephony & analytics in one platform." },
  { value: "freelancer", label: "Freelancer", icon: <Briefcase className="h-6 w-6" />, description: "Manage client businesses — rewards follow your approved referral and management terms." },
  { value: "ambassador", label: "Ambassador", icon: <Users className="h-6 w-6" />, description: "Referrals only — rewards follow the active partner terms for your account." },
  { value: "white_label", label: "White-Label", icon: <Palette className="h-6 w-6" />, description: "Resell Pulse AI under your own brand, logo and domain." },
];

export function AccountTypeOrbitSelector({ value, onChange }: AccountTypeOrbitSelectorProps) {
  return (
    <OrbitSelector
      ariaLabel="Choose your account type"
      items={ACCOUNT_TYPES}
      selectedValue={value ?? undefined}
      onSelect={onChange}
      rotationInterval={2500}
      centralContent={() => (
        <div className="flex flex-col items-center gap-1 text-center text-primary">
          <Sparkles className="h-8 w-8" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Pulse AI</span>
        </div>
      )}
    />
  );
}

export { ACCOUNT_TYPES };
export type { AccountTypeValue };
