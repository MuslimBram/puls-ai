import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Send, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { usePartnerAccount } from "@/hooks/usePartner";
import { usePartnerWallet, usePayoutRequests, useRequestPayout } from "@/hooks/usePartnerWallet";
import { format } from "date-fns";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Në pritje", variant: "secondary", icon: Clock },
  approved: { label: "Aprovuar", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Refuzuar", variant: "destructive", icon: XCircle },
  processed: { label: "Përfunduar", variant: "default", icon: CheckCircle2 },
};

export const WithdrawalRequestPanel = () => {
  const { data: partner } = usePartnerAccount();
  const { data: wallet } = usePartnerWallet(partner?.id ?? null);
  const { data: payouts = [] } = usePayoutRequests(partner?.id ?? null);
  const requestPayout = useRequestPayout();

  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!partner || !wallet) return null;

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Vendosni një shumë të vlefshme");
      return;
    }
    if (numAmount > (wallet.current_balance ?? 0)) {
      toast.error("Shuma tejkalon balancën tuaj");
      return;
    }
    if (!bankName.trim() || !iban.trim() || !beneficiary.trim()) {
      toast.error("Plotësoni të gjitha fushat bankare");
      return;
    }

    setSubmitting(true);
    try {
      await requestPayout.mutateAsync({
        partnerId: partner.id,
        amount: numAmount,
        method: "bank_transfer",
        bankName: bankName.trim(),
        iban: iban.trim(),
        beneficiary: beneficiary.trim(),
      });
      setAmount("");
      setBankName("");
      setIban("");
      setBeneficiary("");
      toast.success("Kërkesa u dërgua! AI po e analizon para aprovimit.");
    } catch {
      // handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Portofoli im
          </CardTitle>
          <CardDescription>Balanca dhe tërheqjet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-foreground">€{wallet.current_balance?.toFixed(2) ?? "0.00"}</p>
              <p className="text-xs text-muted-foreground">E disponueshme</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-primary">€{wallet.lifetime_earnings?.toFixed(2) ?? "0.00"}</p>
              <p className="text-xs text-muted-foreground">Gjithsej fituar</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-bold text-muted-foreground">€{wallet.pending_amount?.toFixed(2) ?? "0.00"}</p>
              <p className="text-xs text-muted-foreground">Në pritje</p>
            </div>
          </div>

          {/* Withdrawal form */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Kërko tërheqje</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Shuma (€)</Label>
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
                <Label className="text-xs">Emri i përfituesit</Label>
                <Input
                  placeholder="Emri i plotë"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Banka</Label>
                <Input
                  placeholder="Emri i bankës"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">IBAN</Label>
                <Input
                  placeholder="AL..."
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              Çdo kërkesë analizohet nga AI para aprovimit për të siguruar legjitimitetin.
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Duke dërguar..." : "Dërgo kërkesën"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payout history */}
      {payouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historiku i tërheqjeve</CardTitle>
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
                        <p className="text-sm font-medium text-foreground">€{p.requested_amount.toFixed(2)}</p>
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
