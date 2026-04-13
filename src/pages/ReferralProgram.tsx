import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
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
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

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
  const { data: referralCode, isLoading: codeLoading } = useBusinessReferralCode();
  const { data: referrals } = useBusinessReferrals();
  const generateCode = useGenerateReferralCode();
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

  if (codeLoading) {
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
              Refer others and earn 15% of their purchases — credited directly to your wallet.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Gift className="h-3 w-3 mr-1" />
            Open to Everyone
          </Badge>
        </div>

        {/* Referral Link */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Your Referral Link
            </CardTitle>
            <CardDescription>
              Share this link with anyone. When they purchase a package, you earn 15% — credited to your wallet automatically.
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

        {/* Wallet Reward Notice */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Wallet className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Rewards go to your wallet</p>
              <p className="text-xs text-muted-foreground mt-1">
                When a referred user purchases any package, 15% of their payment is automatically credited to your platform wallet. You can use your wallet balance to pay for your own subscription or request a withdrawal.
              </p>
            </div>
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
                  <p className="text-2xl font-bold text-foreground">€{totalRewards.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total Earned</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Referrals</CardTitle>
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
                          <Badge className={rs.color}>€{Number(r.reward_amount).toFixed(2)}</Badge>
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

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How Referrals Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <p className="text-sm font-medium text-foreground">Generate your link</p>
                <p className="text-xs text-muted-foreground">Get your unique referral link — available to all users</p>
              </div>
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <p className="text-sm font-medium text-foreground">Share with others</p>
                <p className="text-xs text-muted-foreground">Send your link to businesses, freelancers or anyone</p>
              </div>
              <div className="text-center space-y-2">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <p className="text-sm font-medium text-foreground">Earn to your wallet</p>
                <p className="text-xs text-muted-foreground">15% of their purchase is credited to your wallet instantly</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ReferralProgram;
