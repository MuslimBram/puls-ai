import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { usePartnerAccount, usePartnerBusinesses, useApplyForPartner } from "@/hooks/usePartner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Handshake,
  Loader2,
  Building2,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

const PartnerDashboard = () => {
  const { data: partner, isLoading } = usePartnerAccount();
  const { data: businesses } = usePartnerBusinesses(partner?.id || null);
  const applyMutation = useApplyForPartner();
  const [partnerName, setPartnerName] = useState("");

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  // Not a partner yet - show application
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
                <Input
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Your Agency Name"
                />
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>✓ Manage unlimited business accounts</p>
                <p>✓ 30-40% discount on subscription plans</p>
                <p>✓ Centralized billing dashboard</p>
                <p>✓ Priority support</p>
              </div>

              <Button
                onClick={() => applyMutation.mutate(partnerName)}
                disabled={!partnerName.trim() || applyMutation.isPending}
                className="w-full"
              >
                {applyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Handshake className="mr-2 h-4 w-4" />}
                Apply Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Partner dashboard
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

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{businesses?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Businesses</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{partner.discount_percent}%</p>
                  <p className="text-xs text-muted-foreground">Discount</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">${partner.monthly_revenue}</p>
                  <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">{partner.billing_model === "partner_pays" ? "Direct" : "Hybrid"}</p>
                  <p className="text-xs text-muted-foreground">Billing Model</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Managed Businesses */}
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
              <p className="text-sm text-muted-foreground text-center py-8">No businesses managed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
