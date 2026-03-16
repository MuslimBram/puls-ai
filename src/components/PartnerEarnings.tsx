import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  usePartnerWallet,
  usePartnerCommissions,
  useWalletTransactions,
  usePayoutRequests,
  useRequestPayout,
} from "@/hooks/usePartnerWallet";
import {
  Wallet,
  TrendingUp,
  Clock,
  DollarSign,
  ArrowDownToLine,
  Loader2,
  Receipt,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";

interface PartnerEarningsProps {
  partnerId: string;
}

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-blue-500/10 text-blue-700",
  paid: "bg-green-500/10 text-green-700",
  cancelled: "bg-destructive/10 text-destructive",
  requested: "bg-yellow-500/10 text-yellow-700",
  sent: "bg-green-500/10 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
};

export const PartnerEarnings = ({ partnerId }: PartnerEarningsProps) => {
  const { data: wallet } = usePartnerWallet(partnerId);
  const { data: commissions } = usePartnerCommissions(partnerId);
  const { data: transactions } = useWalletTransactions(partnerId);
  const { data: payouts } = usePayoutRequests(partnerId);
  const requestPayout = useRequestPayout();
  const [payoutAmount, setPayoutAmount] = useState("");

  const handlePayout = () => {
    const amount = Number(payoutAmount);
    if (amount <= 0 || amount > (wallet?.current_balance || 0)) return;
    requestPayout.mutate({ partnerId, amount });
    setPayoutAmount("");
  };

  const pendingCommissions = commissions?.filter((c) => c.commission_status === "pending") || [];
  const approvedCommissions = commissions?.filter((c) => c.commission_status === "approved") || [];

  const nextCycleEstimate = pendingCommissions.reduce((sum, c) => sum + Number(c.commission_amount), 0);

  return (
    <div className="space-y-6">
      {/* Wallet Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">${wallet?.current_balance?.toFixed(2) ?? "0.00"}</p>
                <p className="text-xs text-muted-foreground">Available Balance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-foreground">${wallet?.pending_amount?.toFixed(2) ?? "0.00"}</p>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-foreground">${wallet?.lifetime_earnings?.toFixed(2) ?? "0.00"}</p>
                <p className="text-xs text-muted-foreground">Lifetime Earnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-foreground">${nextCycleEstimate.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Next Cycle Est.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payout Request */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4" />
            Request Payout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                placeholder="0.00"
                className="pl-7"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                max={wallet?.current_balance || 0}
              />
            </div>
            <Button
              onClick={handlePayout}
              disabled={
                !payoutAmount ||
                Number(payoutAmount) <= 0 ||
                Number(payoutAmount) > (wallet?.current_balance || 0) ||
                requestPayout.isPending
              }
            >
              {requestPayout.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Request Withdrawal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Min $10. Payouts are processed manually by admin within 3-5 business days.
          </p>
        </CardContent>
      </Card>

      {/* Commission History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Commissions ({commissions?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commissions && commissions.length > 0 ? (
            <div className="space-y-2">
              {commissions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {c.plan_name} plan · ${Number(c.gross_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.commission_percent}% = ${Number(c.commission_amount).toFixed(2)}
                      {c.billing_period_start && ` · ${format(new Date(c.billing_period_start), "MMM yyyy")}`}
                    </p>
                  </div>
                  <Badge className={statusColor[c.commission_status] || ""}>{c.commission_status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No commissions yet</p>
          )}
        </CardContent>
      </Card>

      {/* Payout History */}
      {payouts && payouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">${Number(p.requested_amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "MMM d, yyyy")} · {p.payout_method}
                    </p>
                    {p.admin_note && <p className="text-xs text-muted-foreground italic mt-0.5">{p.admin_note}</p>}
                  </div>
                  <Badge className={statusColor[p.payout_status] || ""}>{p.payout_status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
