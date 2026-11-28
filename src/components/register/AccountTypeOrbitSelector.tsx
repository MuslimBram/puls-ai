import { Building2, Briefcase, Palette, Sparkles, Users } from "lucide-react";
import { COMMISSION_POLICY } from "@/config/commissionPolicy";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

type AccountTypeValue = "business" | "freelancer" | "ambassador" | "white_label";

type AccountTypeOrbitSelectorProps = {
  value: AccountTypeValue | null;
  onChange: (value: AccountTypeValue) => void;
};

const ACCOUNT_TYPES: OrbitSelectorItem<AccountTypeValue>[] = [
  { value: "business", label: "Business", icon: <Building2 className="h-6 w-6" />, description: "For company owners and teams: unified inbox, CRM, AI assistant, marketing automation, telephony, analytics and a 7-day trial in one workspace." },
  { value: "freelancer", label: "Freelancer", icon: <Briefcase className="h-6 w-6" />, description: `For consultants and operators managing client businesses: separate client workspaces and management tools. Earns ${COMMISSION_POLICY.freelancer.firstPaymentReferralPercent}% of each referred business's first payment + ${COMMISSION_POLICY.freelancer.managementFeeSharePercent}% of management fees actually collected.` },
  { value: "ambassador", label: "Ambassador", icon: <Users className="h-6 w-6" />, description: `For people who introduce businesses to Pulse AI, with no client-management workload. Earns ${COMMISSION_POLICY.ambassador.lifetimeRecurringPercent}% on every payment of referred businesses (lifetime) + a one-time ${COMMISSION_POLICY.ambassador.firstPaymentBonusPercent}% bonus on the first payment.` },
  { value: "white_label", label: "White-Label", icon: <Palette className="h-6 w-6" />, description: "For agencies and resellers: your own brand, logo and domain, client account management and a reviewed commercial setup." },
];

export function AccountTypeOrbitSelector({ value, onChange }: AccountTypeOrbitSelectorProps) {
  const handleSelect = (next: AccountTypeValue) => {
    sessionStorage.setItem("registration_account_type", next);
    onChange(next);
  };

  return (
    <OrbitSelector
      ariaLabel="Choose your account type"
      items={ACCOUNT_TYPES}
      selectedValue={value ?? undefined}
      onSelect={handleSelect}
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
