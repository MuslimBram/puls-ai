import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserWallets, useWalletTransactions, useCreateWallet, useAddTransaction } from "@/hooks/useUserWallet";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Plus, Clock, TrendingUp } from "lucide-react";
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

export const UserWalletPanel = () => {
  const { data: wallets, isLoading } = useUserWallets();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [newCurrency, setNewCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<string>("deposit");
  const [txDesc, setTxDesc] = useState("");

  const createWallet = useCreateWallet();
  const addTransaction = useAddTransaction();

  const selectedWallet = wallets?.find((w) => w.id === selectedWalletId) ?? wallets?.[0];
  const { data: transactions } = useWalletTransactions(selectedWallet?.id);

  const existingCurrencies = new Set(wallets?.map((w) => w.currency) ?? []);
  const availableCurrencies = CURRENCIES.filter((c) => !existingCurrencies.has(c));

  const handleTopUp = () => {
    if (!selectedWallet || !txAmount || Number(txAmount) <= 0) return;
    addTransaction.mutate({
      wallet_id: selectedWallet.id,
      type: txType,
      amount: Number(txAmount),
      currency: selectedWallet.currency,
      description: txDesc || undefined,
    });
    setTxAmount("");
    setTxDesc("");
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
                <Badge variant={wallet.is_active ? "default" : "secondary"}>
                  {wallet.currency}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  Depozita: {Number(wallet.lifetime_deposits).toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-red-500" />
                  Tërheqje: {Number(wallet.lifetime_withdrawals).toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add new currency wallet */}
        {availableCurrencies.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-6">
              <Plus className="h-8 w-8 text-muted-foreground" />
              <div className="flex gap-2">
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Monedha" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!newCurrency || createWallet.isPending}
                  onClick={() => { createWallet.mutate(newCurrency); setNewCurrency(""); }}
                >
                  Shto
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transaction form */}
      {selectedWallet && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Veprim i ri — {selectedWallet.currency}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={txType} onValueChange={setTxType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Rimbushje</SelectItem>
                  <SelectItem value="withdrawal">Tërheqje</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Shuma"
                className="w-32"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                min={0}
                step="0.01"
              />
              <Input
                placeholder="Përshkrimi (opsionale)"
                className="flex-1 min-w-[150px]"
                value={txDesc}
                onChange={(e) => setTxDesc(e.target.value)}
              />
              <Button onClick={handleTopUp} disabled={addTransaction.isPending || !txAmount}>
                {txType === "deposit" ? <ArrowUpCircle className="mr-2 h-4 w-4" /> : <ArrowDownCircle className="mr-2 h-4 w-4" />}
                {txType === "deposit" ? "Rimbush" : "Tërhiq"}
              </Button>
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
                        <ArrowUpCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{TYPE_LABELS[tx.type] ?? tx.type}</p>
                        {tx.description && <p className="text-xs text-muted-foreground">{tx.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isCredit ? "text-green-600" : "text-red-600"}`}>
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
