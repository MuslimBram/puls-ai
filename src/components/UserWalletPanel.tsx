import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUserWallets,
  useWalletTransactions,
  useWithdrawalRequests,
  useCreateWallet,
  useRequestWithdrawal,
} from "@/hooks/useUserWallet";
import { Wallet, ArrowDownCircle, Plus, Clock, TrendingUp, ShieldCheck, AlertTriangle, CreditCard, Building2, Lock } from "lucide-react";
import { format } from "date-fns";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "ALL"];

const TYPE_LABELS: Record<string, string> = {
  deposit: "Rimbushje",
  withdrawal: "Tërheqje",
  subscription_payment: "Pagesë plani",
  refund: "Rimbursim",
  commission_credit: "Komision",
  transfer: "Transfer",
  adjustment: "Korrigjim",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_ai_review: { label: "Në verifikim AI", variant: "secondary" },
  pending_admin_review: { label: "Në pritje Admini", variant: "outline" },
  approved: { label: "Aprovuar", variant: "default" },
  blocked: { label: "Bllokuar", variant: "destructive" },
  rejected: { label: "Refuzuar", variant: "destructive" },
  completed: { label: "Përfunduar", variant: "default" },
};

export const UserWalletPanel = () => {
  const { data: wallets, isLoading } = useUserWallets();
  const { data: withdrawalRequests } = useWithdrawalRequests();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [newCurrency, setNewCurrency] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const createWallet = useCreateWallet();
  const requestWithdrawal = useRequestWithdrawal();

  const selectedWallet = wallets?.find((w) => w.id === selectedWalletId) ?? wallets?.[0];
  const { data: transactions } = useWalletTransactions(selectedWallet?.id);

  const existingCurrencies = new Set(wallets?.map((w) => w.currency) ?? []);
  const availableCurrencies = CURRENCIES.filter((c) => !existingCurrencies.has(c));

  // TODO: Check if user has connected a payment method
  const hasPaymentMethod = false;

  const handleWithdrawal = () => {
    if (!selectedWallet || !withdrawAmount || Number(withdrawAmount) <= 0) return;
    const amount = Number(withdrawAmount);
    if (amount > Number(selectedWallet.current_balance)) return;
    requestWithdrawal.mutate({
      wallet_id: selectedWallet.id,
      amount,
      currency: selectedWallet.currency,
    });
    setWithdrawAmount("");
  };

  if (isLoading) return <div className="text-muted-foreground text-center py-8">Po ngarkohet...</div>;

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
                    <p className="text-xs text-muted-foreground">Balancë aktuale</p>
                  </div>
                </div>
                <Badge variant={wallet.is_active ? "default" : "secondary"}>{wallet.currency}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  Depozita: {Number(wallet.lifetime_deposits).toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-destructive" />
                  Tërheqje: {Number(wallet.lifetime_withdrawals).toFixed(2)}
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
                  <SelectTrigger className="w-24"><SelectValue placeholder="Monedha" /></SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!newCurrency || createWallet.isPending} onClick={() => { createWallet.mutate(newCurrency); setNewCurrency(""); }}>
                  Shto
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top-up: requires payment method */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Rimbushje portofoli
          </CardTitle>
          <CardDescription>
            Për të rimbushur portofolinduhet të lidhni një metodë pagese (kartë bankare ose transfer bankar).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPaymentMethod ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center space-y-3">
              <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-foreground font-medium">
                Nuk keni lidhur asnjë metodë pagese
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Për të rimbushur portofolin, duhet të lidhni kartën bankare ose llogarinë bankare. 
                Fondet depozitohen pas verifikimit.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Lidh kartën
                </Button>
                <Button variant="outline" size="sm">
                  <Building2 className="h-4 w-4 mr-2" />
                  Transfer bankar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Metoda e pagesës e lidhur. Mund të rimbushni portofolinë.</p>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal */}
      {selectedWallet && Number(selectedWallet.current_balance) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kërko tërheqje — {selectedWallet.currency}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Input
                type="number"
                placeholder="Shuma"
                className="w-40"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                min={0}
                step="0.01"
                max={Number(selectedWallet.current_balance)}
              />
              <Button
                onClick={handleWithdrawal}
                disabled={requestWithdrawal.isPending || !withdrawAmount || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > Number(selectedWallet.current_balance)}
              >
                <ArrowDownCircle className="mr-2 h-4 w-4" />
                Kërko tërheqje
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>Tërheqjet verifikohen automatikisht nga AI për siguri dhe kërkohet aprovimi i Adminit para ekzekutimit.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package purchase info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Blerje paketash me portofol
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-primary/5 p-4 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Me gjendjen në portofol mund të blini paketat e abonimit.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Çdo blerje verifikohet nga AI dhe aprovohet nga Adminët para ekzekutimit për sigurinë e transaksionit.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal requests */}
      {withdrawalRequests && withdrawalRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kërkesat për tërheqje</CardTitle>
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
            <CardTitle className="text-lg">Historiku i transaksioneve</CardTitle>
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
