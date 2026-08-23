import { Building2, Briefcase, Palette, Users } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

type AccountTypeValue = "business" | "freelancer" | "ambassador" | "white_label";

type AccountTypeOrbitSelectorProps = {
  value: AccountTypeValue | null;
  onChange: (value: AccountTypeValue) => void;
};

const ACCOUNT_TYPES: OrbitSelectorItem<AccountTypeValue>[] = [
  {
    value: "business",
    label: "Business",
    icon: <Building2 className="h-6 w-6" />,
    description: "Manage your business — inbox, CRM, marketing, AI, telephony & analytics in one platform.",
  },
  {
    value: "freelancer",
    label: "Freelancer",
    icon: <Briefcase className="h-6 w-6" />,
    description: "Manage client businesses — rewards follow your approved referral and management terms.",
  },
  {
    value: "ambassador",
    label: "Ambassador",
    icon: <Users className="h-6 w-6" />,
    description: "Referrals only — rewards follow the active partner terms for your account.",
  },
  {
    value: "white_label",
    label: "White-Label",
    icon: <Palette className="h-6 w-6" />,
    description: "Resell Pulse AI under your own brand, logo and domain.",
  },
];

const ACCOUNT_TYPE_DETAILS: Record<AccountTypeValue, string[]> = {
  business: ["Unified inbox", "CRM & Pipeline", "Personal AI assistant", "Automated marketing"],
  freelancer: ["Referral rewards per active partner terms", "Management earnings per approved relation", "Purchase plan per business", "7-day free trial"],
  ambassador: ["Eligible first-payment commissions when configured", "Eligibility follows active partner terms", "No plan purchases needed", "7-day free trial"],
  white_label: ["Your brand & domain", "Unlimited client accounts", "Setup + monthly licence", "Reviewed by our team"],
};

export function AccountTypeOrbitSelector({ value, onChange }: AccountTypeOrbitSelectorProps) {
  return (
    <OrbitSelector
      ariaLabel="Choose your account type"
      items={ACCOUNT_TYPES}
      selectedValue={value ?? undefined}
      onSelect={onChange}
      rotationInterval={2500}
      centralContent={(item) => {
        if (!item) return null;
        const details = ACCOUNT_TYPE_DETAILS[item.value];
        return (
          <div className="flex max-w-32 flex-col items-center gap-1 px-2 text-center sm:max-w-36">
            <div className="text-primary">{item.icon}</div>
            <span className="text-xs font-semibold sm:text-sm">{item.label}</span>
            <span className="line-clamp-2 text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
              {details[0]}
            </span>
          </div>
        );
      }}
    />
  );
}

export { ACCOUNT_TYPES };
export type { AccountTypeValue };
