import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useReferralEligibility,
  useBusinessReferralCode,
  useGenerateReferralCode,
  useBusinessReferrals,
} from "@/hooks/useBusinessReferral";
import {
  Gift,
  Copy,
  Check,
  Link as LinkIcon,
  Users,
  DollarSign,
  AlertCircle,
  Zap,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: "bg-yellow-500/10 text-yellow-700", label: "Pending" },
  active: { icon: CheckCircle2, color: "bg-green-500/10 text-green-700", label: "Active" },
  converted: { icon: CheckCircle2, color: "bg-primary/10 text-primary", label: "Converted" },
  expired: { icon: XCircle, color: "bg-muted text-muted-foreground", label: "Expired" },
};

const rewardStatusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-yellow-500/10 text-yellow-700", label: "Pending" },
  credited: { color: "bg-green-500/10 text-green-700", label: "Credited" },
  paid: { color: "bg-primary/10 text-primary", label: "Paid" },
};

const ReferralProgram = () => {
  const { data: eligibility, isLoading: eligLoading } = useReferralEligibility();
  const { data: referralCode, isLoading: codeLoading } = useBusinessReferralCode();
  const { data: referrals } = useBusinessReferrals();
  const generateCode = useGenerateReferralCode();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const referralLink = referralCode?.referral_code
    ? `${window.location.origin}/register?ref=${referralCode.referral_code}`
    : null;

  const copyLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const totalRewards = referrals?.reduce((sum, r) => sum + Number(r.reward_amount), 0) ?? 0;
  const convertedCount = referrals?.filter((r) => r.status === "converted").length ?? 0;

  if (eligLoading || codeLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Referral Program</h1>
            <p className="text-sm text-muted-foreground">
              Refer businesses and earn rewards on their subscriptions.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Gift className="h-3 w-3 mr-1" />
            Business Referral
          </Badge>
        </div>

        {/* Eligibility Status */}
        {!eligibility?.eligible && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Not yet eligible</p>
                <p className="text-sm text-muted-foreground mt-1">{eligibility?.reason}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => navigate("/pricing")}
                >
                  <Zap className="h-3 w-3 mr-1" />
                  View Qualifying Packages
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {eligibility?.eligible && (
          <>
            {/* Referral Link */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Your Referral Link
                </CardTitle>
                <CardDescription>
                  Share this link. New businesses get a discount, and you earn rewards.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {referralCode ? (
                  <div className="flex items-center gap-2">
                    <Input readOnly value={referralLink || ""} className="font-mono text-xs bg-background" />
                    <Button size="sm" variant="outline" onClick={copyLink}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => generateCode.mutate()} disabled={generateCode.isPending}>
                    {generateCode.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4 mr-2" />
                    )}
                    Generate Referral Link
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{referrals?.length ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Total Referrals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{convertedCount}</p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">${totalRewards.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Total Rewards</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Referral List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Referred Businesses</CardTitle>
              </CardHeader>
              <CardContent>
                {referrals && referrals.length > 0 ? (
                  <div className="space-y-2">
                    {referrals.map((r) => {
                      const st = statusConfig[r.status] || statusConfig.pending;
                      const rs = rewardStatusConfig[r.reward_status] || rewardStatusConfig.pending;
                      return (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {r.referred_email || "Pending signup"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(r.created_at), "MMM d, yyyy")}
                              {r.subscription_plan && ` · ${r.subscription_plan} plan`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.reward_amount > 0 && (
                              <Badge className={rs.color}>${Number(r.reward_amount).toFixed(2)}</Badge>
                            )}
                            <Badge className={st.color}>{st.label}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No referrals yet. Share your link to get started!
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How Business Referrals Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <p className="text-sm font-medium text-foreground">Subscribe to a qualifying package</p>
                <p className="text-xs text-muted-foreground">Purchase a 3-month or 6-month plan to unlock referrals</p>
              </div>
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <p className="text-sm font-medium text-foreground">Share your referral link</p>
                <p className="text-xs text-muted-foreground">Send your unique link to other businesses</p>
              </div>
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <p className="text-sm font-medium text-foreground">Earn rewards</p>
                <p className="text-xs text-muted-foreground">Get account credits when referred businesses subscribe</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ReferralProgram;
