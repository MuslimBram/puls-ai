import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, ArrowDownCircle, Send, Clock, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { usePartnerAccount } from "@/hooks/usePartner";
import { usePartnerWallet, usePayoutRequests, useRequestPayout } from "@/hooks/usePartnerWallet";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatALL } from "@/lib/currency";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  processed: { label: "Completed", variant: "default", icon: CheckCircle2 },
};

const PAYOUT_METHODS = [
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
];

export const WithdrawalRequestPanel = () => {
  const { data: partner } = usePartnerAccount();
  const { data: wallet } = usePartnerWallet(partner?.id ?? null);
  const { data: payouts = [] } = usePayoutRequests(partner?.id ?? null);
  const requestPayout = useRequestPayout();

  const [amount, setAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!partner || !wallet) return null;

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (numAmount > (wallet.current_balance ?? 0)) {
      toast.error("Amount exceeds your balance");
      return;
    }
    if (!payoutMethod || !payoutEmail.trim()) {
      toast.error("Fill in the method and email");
      return;
    }

    setSubmitting(true);
    try {
      await requestPayout.mutateAsync({
        partnerId: partner.id,
        amount: numAmount,
        method: payoutMethod,
        bankName: payoutMethod,
        iban: payoutEmail.trim(),
        beneficiary: payoutEmail.trim(),
      });
      setAmount("");
      setPayoutEmail("");
      setPayoutMethod("");
      toast.success("Request sent! AI is analyzing before approval.");
    } catch {
      // handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            My Wallet
          </CardTitle>
          <CardDescription>Balance and withdrawals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-foreground">{formatALL(wallet.current_balance?.toFixed(2) ?? "0.00")}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-primary">{formatALL(wallet.lifetime_earnings?.toFixed(2) ?? "0.00")}</p>
              <p className="text-xs text-muted-foreground">Total Earned</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-muted-foreground">{formatALL(wallet.pending_amount?.toFixed(2) ?? "0.00")}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-primary/5 p-3 text-xs text-muted-foreground mb-4 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <p>Wallet is automatically funded from referral earnings. Withdrawals are processed via PayPal or Payoneer only.</p>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Request Withdrawal</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount (ALL)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={1}
                  max={wallet.current_balance ?? 0}
                />
              </div>
              <div>
                <Label className="text-xs">Method</Label>
                <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {PAYOUT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {payoutMethod && (
              <div>
                <Label className="text-xs">Email {payoutMethod === "paypal" ? "PayPal" : "Payoneer"}</Label>
                <Input
                  type="email"
                  placeholder={`Email ${payoutMethod === "paypal" ? "PayPal" : "Payoneer"}`}
                  value={payoutEmail}
                  onChange={(e) => setPayoutEmail(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              Each request is analyzed by AI before approval to ensure legitimacy.
            </div>
            <Button onClick={handleSubmit} disabled={submitting || !payoutMethod || !payoutEmail.trim()} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {payouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Withdrawal History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payouts.map((p) => {
                const cfg = statusConfig[p.payout_status] ?? statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatALL(p.requested_amount.toFixed(2))}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(p.created_at), "dd MMM yyyy, HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
