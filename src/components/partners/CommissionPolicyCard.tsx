import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COMMISSION_POLICY_VERSION, policyCopy } from "@/config/commissionPolicy";

/** The owner-approved policy, rendered from the same constants the backend pays with. */
export const CommissionPolicyCard = ({ compact = false }: { compact?: boolean }) => {
  const { i18n } = useTranslation();
  const isSq = i18n.resolvedLanguage?.toLowerCase().startsWith("sq") ?? false;
  const copy = policyCopy(isSq);
  return (
    <Card data-testid="commission-policy-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {copy.title}
          <Badge variant="outline" className="font-normal">{COMMISSION_POLICY_VERSION}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{copy.referral}</p>
        <p>{copy.freelancer}</p>
        <p>{copy.ambassador}</p>
        {!compact && <p className="pt-1 text-xs">{copy.rules}</p>}
      </CardContent>
    </Card>
  );
};
