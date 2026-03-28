import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FreelancerBusinessPurchase } from "@/components/FreelancerBusinessPurchase";
import { Badge } from "@/components/ui/badge";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { usePartnerAccount, usePartnerReferrals } from "@/hooks/usePartner";
import { usePartnerWallet, usePartnerCommissions, useWalletTransactions } from "@/hooks/usePartnerWallet";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { FREELANCER_COMMISSION_RATE, BUSINESS_REFERRAL_COMMISSION_RATE } from "@/config/plans";
import {
  Wallet, Users, TrendingUp, ArrowUpCircle, ArrowDownCircle,
  Briefcase, Building2, Percent, Gift, Shield, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";

// ─── Business Owner Dashboard ───
const BusinessDashboardWidget = () => {
  const { subscription, plan } = useFeatureGating();
  const referredBy = subscription?.referred_by_partner_id;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Your Plan & Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-bold text-foreground">{plan?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Current plan</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-bold text-primary">
              €{plan?.monthlyPrice ?? 0}/mo
            </p>
            <p className="text-xs text-muted-foreground">Monthly price</p>
          </div>
        </div>

        {referredBy && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 p-3">
            <Gift className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Active referral discount</p>
              <p className="text-xs text-muted-foreground">
                You received a {BUSINESS_REFERRAL_COMMISSION_RATE}% discount from your referrer
              </p>
            </div>
            <Badge variant="default" className="ml-auto">{BUSINESS_REFERRAL_COMMISSION_RATE}%</Badge>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Status: <Badge variant={subscription?.subscription_status === "active" ? "default" : "secondary"} className="text-xs ml-1">
            {subscription?.subscription_status ?? "—"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Freelancer / Partner Dashboard ───
const FreelancerDashboardWidget = () => {
  const { data: partner } = usePartnerAccount();
  const { data: wallet } = usePartnerWallet(partner?.id ?? null);
  const { data: referrals } = usePartnerReferrals(partner?.id ?? null);
  const { data: commissions = [] } = usePartnerCommissions(partner?.id ?? null);
  const { data: transactions = [] } = useWalletTransactions(partner?.id ?? null);

  if (!partner) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Briefcase className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No active partner/freelancer account</p>
        </CardContent>
      </Card>
    );
  }

  const copyReferralCode = () => {
    if (partner.referral_code) {
      navigator.clipboard.writeText(partner.referral_code);
      toast.success("Referral code copied!");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Freelancer Dashboard
          </CardTitle>
          <CardDescription>Your earnings and referrals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <Wallet className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold text-foreground">€{wallet?.current_balance?.toFixed(2) ?? "0.00"}</p>
              <p className="text-xs text-muted-foreground">Balance</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold text-primary">€{wallet?.lifetime_earnings?.toFixed(2) ?? "0.00"}</p>
              <p className="text-xs text-muted-foreground">Total earned</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold text-foreground">{referrals?.totalReferrals ?? 0}</p>
              <p className="text-xs text-muted-foreground">Referred businesses</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <Percent className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold text-foreground">{FREELANCER_COMMISSION_RATE}%</p>
              <p className="text-xs text-muted-foreground">Referral commission</p>
            </div>
          </div>

          {partner.referral_code && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 p-3">
              <Gift className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Your referral code</p>
                <p className="text-xs text-muted-foreground font-mono">{partner.referral_code}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copyReferralCode}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground text-xs">Referral commission</p>
              <p className="font-bold text-foreground">{FREELANCER_COMMISSION_RATE}% lifetime</p>
              <p className="text-xs text-muted-foreground mt-1">For every referred business that pays</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground text-xs">Management earnings</p>
              <p className="font-bold text-foreground">40% of management</p>
              <p className="text-xs text-muted-foreground mt-1">When you manage businesses (with approval)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {commissions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Commissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {commissions.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{c.plan_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.commission_percent}% of €{c.gross_amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">+€{c.commission_amount.toFixed(2)}</p>
                    <Badge variant={c.commission_status === "approved" ? "default" : "secondary"} className="text-[10px]">
                      {c.commission_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {transactions.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {t.amount >= 0 ? (
                      <ArrowUpCircle className="h-3 w-3 text-primary" />
                    ) : (
                      <ArrowDownCircle className="h-3 w-3 text-destructive" />
                    )}
                    <span className="text-xs text-foreground truncate max-w-[180px]">{t.description || t.type}</span>
                  </div>
                  <span className={`text-xs font-medium ${t.amount >= 0 ? "text-primary" : "text-destructive"}`}>
                    {t.amount >= 0 ? "+" : ""}€{t.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Admin / Owner Dashboard ───
const AdminDashboardWidget = () => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Admin / Owner Panel
        </CardTitle>
        <CardDescription>Control the earnings ecosystem from the Admin page</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Freelancer referral commission</p>
            <p className="font-bold text-foreground">{FREELANCER_COMMISSION_RATE}%</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Business referral discount</p>
            <p className="font-bold text-foreground">{BUSINESS_REFERRAL_COMMISSION_RATE}%</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Go to Admin page to view subscriptions, referrals, commissions and approvals.
        </p>
      </CardContent>
    </Card>
  );
};

// ─── Main Export ───
export const RoleDashboardWidgets = () => {
  const { isAdmin, isFreelancer, isBusinessOwner, isLoading } = useRolePermissions();

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      {isBusinessOwner && <BusinessDashboardWidget />}
      {(isFreelancer || isBusinessOwner) && <FreelancerDashboardWidget />}
      {isFreelancer && <FreelancerBusinessPurchase isFreelancer={isFreelancer} />}
      {isAdmin && <AdminDashboardWidget />}
    </div>
  );
};
