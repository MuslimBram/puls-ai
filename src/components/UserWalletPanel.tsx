import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUserWallets,
  useWalletTransactions,
  useWithdrawalRequests,
  useCreateWallet,
  useRequestWithdrawal,
} from "@/hooks/useUserWallet";
import { Wallet, ArrowDownCircle, Plus, Clock, TrendingUp, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "ALL"];

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  subscription_payment: "Plan Payment",
  refund: "Refund",
  commission_credit: "Commission",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_ai_review: { label: "AI Review", variant: "secondary" },
  pending_admin_review: { label: "Pending Admin", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  blocked: { label: "Blocked", variant: "destructive" },
  rejected: { label: "Rejected", variant: "destructive" },
  completed: { label: "Completed", variant: "default" },
};

const PAYOUT_METHODS = [
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
];

export const UserWalletPanel = () => {
  const { data: wallets, isLoading } = useUserWallets();
  const { data: withdrawalRequests } = useWithdrawalRequests();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [newCurrency, setNewCurrency] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");

  const createWallet = useCreateWallet();
  const requestWithdrawal = useRequestWithdrawal();

  const selectedWallet = wallets?.find((w) => w.id === selectedWalletId) ?? wallets?.[0];
  const { data: transactions } = useWalletTransactions(selectedWallet?.id);

  const existingCurrencies = new Set(wallets?.map((w) => w.currency) ?? []);
  const availableCurrencies = CURRENCIES.filter((c) => !existingCurrencies.has(c));

  const handleWithdrawal = () => {
    if (!selectedWallet || !withdrawAmount || Number(withdrawAmount) <= 0) return;
    if (!payoutMethod || !payoutEmail.trim()) return;
    const amount = Number(withdrawAmount);
    if (amount > Number(selectedWallet.current_balance)) return;
    requestWithdrawal.mutate({
      wallet_id: selectedWallet.id,
      amount,
      currency: selectedWallet.currency,
      payout_method: payoutMethod,
      payout_details: { email: payoutEmail.trim(), method: payoutMethod },
    });
    setWithdrawAmount("");
    setPayoutEmail("");
  };

  if (isLoading) return <div className="text-muted-foreground text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Wallet cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {wallets?.map((wallet) => (
          <Card
            key={wallet.id}
            className={`cursor-pointer transition-all ${selectedWallet?.id === wallet.id ? "ring-2 ring-primary" : "hover:shadow-md"}`}
            onClick={() => setSelectedWalletId(wallet.id)}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wallet className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {Number(wallet.current_balance).toFixed(2)} {wallet.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">Current balance</p>
                  </div>
                </div>
                <Badge variant={wallet.is_active ? "default" : "secondary"}>{wallet.currency}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  Deposits: {Number(wallet.lifetime_deposits).toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-destructive" />
                  Withdrawals: {Number(wallet.lifetime_withdrawals).toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {availableCurrencies.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-6">
              <Plus className="h-8 w-8 text-muted-foreground" />
              <div className="flex gap-2">
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Currency" /></SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!newCurrency || createWallet.isPending} onClick={() => { createWallet.mutate(newCurrency); setNewCurrency(""); }}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* How wallet works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            How the wallet works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-primary/5 p-4 text-sm text-foreground space-y-2">
            <p className="font-medium">Your wallet is automatically funded from referral earnings.</p>
            <p className="text-xs text-muted-foreground">
              When you refer businesses or clients, the commission is credited directly to your wallet.
              With these funds you can purchase subscription plans or request withdrawals via PayPal or Payoneer.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal */}
      {selectedWallet && Number(selectedWallet.current_balance) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Withdrawal — {selectedWallet.currency}</CardTitle>
            <CardDescription>Choose PayPal or Payoneer for withdrawal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min={0}
                  step="0.01"
                  max={Number(selectedWallet.current_balance)}
                />
              </div>
              <div>
                <Label className="text-xs">Payout method</Label>
                <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                  <SelectTrigger><SelectValue placeholder="Choose method" /></SelectTrigger>
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
                <Label className="text-xs">
                  {payoutMethod === "paypal" ? "PayPal" : "Payoneer"} Email
                </Label>
                <Input
                  type="email"
                  placeholder={`${payoutMethod === "paypal" ? "PayPal" : "Payoneer"} email`}
                  value={payoutEmail}
                  onChange={(e) => setPayoutEmail(e.target.value)}
                />
              </div>
            )}
            <Button
              onClick={handleWithdrawal}
              disabled={
                requestWithdrawal.isPending ||
                !withdrawAmount ||
                Number(withdrawAmount) <= 0 ||
                Number(withdrawAmount) > Number(selectedWallet.current_balance) ||
                !payoutMethod ||
                !payoutEmail.trim()
              }
              className="w-full"
            >
              <ArrowDownCircle className="mr-2 h-4 w-4" />
              Request Withdrawal
            </Button>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>Withdrawals are automatically verified by AI for security and require Admin approval before execution.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package purchase info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Purchase plans with wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-primary/5 p-4 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">You can purchase subscription plans with your wallet balance.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Funds come only from referral earnings. Every purchase is verified by AI and approved by Admins.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal requests */}
      {withdrawalRequests && withdrawalRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Withdrawal Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {withdrawalRequests.map((wr) => {
                const statusInfo = STATUS_LABELS[wr.status] ?? { label: wr.status, variant: "secondary" as const };
                const isRisky = Number(wr.ai_risk_score ?? 0) >= 50;
                return (
                  <div key={wr.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      {isRisky ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : (
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {Number(wr.amount).toFixed(2)} {wr.currency}
                        </p>
                        {wr.ai_risk_reason && (
                          <p className="text-xs text-muted-foreground max-w-xs truncate">{wr.ai_risk_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {wr.ai_risk_score != null && (
                        <span className={`text-xs font-mono ${Number(wr.ai_risk_score) >= 50 ? "text-destructive" : "text-primary"}`}>
                          AI: {Number(wr.ai_risk_score).toFixed(0)}
                        </span>
                      )}
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(wr.created_at), "dd/MM/yyyy")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction history */}
      {selectedWallet && transactions && transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.map((tx) => {
                const isCredit = ["deposit", "refund", "commission_credit"].includes(tx.type);
                return (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      {isCredit ? (
                        <TrendingUp className="h-5 w-5 text-primary" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5 text-destructive" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{TYPE_LABELS[tx.type] ?? tx.type}</p>
                        {tx.description && <p className="text-xs text-muted-foreground">{tx.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isCredit ? "text-primary" : "text-destructive"}`}>
                        {isCredit ? "+" : "−"}{Number(tx.amount).toFixed(2)} {tx.currency}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm")}
                      </div>
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
