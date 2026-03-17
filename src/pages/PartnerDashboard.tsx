import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePartnerAccount, usePartnerBusinesses, usePartnerReferrals, useApplyForPartner } from "@/hooks/usePartner";
import { PartnerEarnings } from "@/components/PartnerEarnings";
import { PartnerBulkBilling } from "@/components/PartnerBulkBilling";
import {
  Handshake,
  Loader2,
  Building2,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Copy,
  Check,
  Link as LinkIcon,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

const PartnerDashboard = () => {
  const { data: partner, isLoading } = usePartnerAccount();
  const { data: businesses } = usePartnerBusinesses(partner?.id || null);
  const { data: referralStats } = usePartnerReferrals(partner?.id || null);
  const applyMutation = useApplyForPartner();
  const [partnerName, setPartnerName] = useState("");
  const [copied, setCopied] = useState(false);

  const referralLink = partner?.referral_code
    ? `${window.location.origin}/register?ref=${partner.referral_code}`
    : null;

  const copyLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  // Not a partner yet
  if (!partner) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-6 py-12">
          <div className="text-center">
            <Handshake className="mx-auto h-16 w-16 text-primary mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Partner Program</h1>
            <p className="text-muted-foreground">
              Manage multiple businesses with discounted pricing. Apply to become a partner and enjoy 30-40% savings on all managed subscriptions.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apply for Partner Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Agency / Partner Name</Label>
                <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Your Agency Name" />
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>✓ Manage unlimited business accounts</p>
                <p>✓ 30-40% discount on subscription plans</p>
                <p>✓ Centralized billing dashboard</p>
                <p>✓ Priority support</p>
              </div>
              <Button onClick={() => applyMutation.mutate(partnerName)} disabled={!partnerName.trim() || applyMutation.isPending} className="w-full">
                {applyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Handshake className="mr-2 h-4 w-4" />}
                Apply Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Partner Dashboard</h1>
          <Badge className={partner.status === "active" ? "bg-green-500/10 text-green-700" : "bg-yellow-500/10 text-yellow-700"}>
            {partner.status}
          </Badge>
        </div>

        {partner.status === "pending" && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium">Application Under Review</p>
                <p className="text-xs text-muted-foreground">We'll notify you once your partner account is approved.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Referral Link */}
        {partner.status === "active" && referralLink && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Your Referral Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input readOnly value={referralLink} className="font-mono text-xs bg-background" />
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Share this link with businesses. They'll be automatically linked to your partner account.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{referralStats?.totalReferrals ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total Referrals</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{referralStats?.activeBusinesses ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Active Businesses</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">${referralStats?.totalRevenue ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">{partner.discount_percent}%</p>
                  <p className="text-xs text-muted-foreground">Your Discount</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Businesses + Earnings */}
        <Tabs defaultValue="businesses">
          <TabsList>
            <TabsTrigger value="businesses">
              <Building2 className="h-3 w-3 mr-1" />
              Businesses
            </TabsTrigger>
            <TabsTrigger value="billing">
              <DollarSign className="h-3 w-3 mr-1" />
              Bulk Billing
            </TabsTrigger>
            <TabsTrigger value="earnings">
              <Wallet className="h-3 w-3 mr-1" />
              Earnings & Payouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="businesses">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Managed Businesses</CardTitle>
              </CardHeader>
              <CardContent>
                {businesses?.length ? (
                  <div className="space-y-2">
                    {businesses.map((biz: any) => (
                      <div key={biz.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">{biz.workspaces?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">Added {format(new Date(biz.added_at), "MMM d, yyyy")}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">Active</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No businesses managed yet. Share your referral link to get started.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing">
            <PartnerBulkBilling partnerId={partner.id} />
          </TabsContent>

          <TabsContent value="earnings">
            <PartnerEarnings partnerId={partner.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
