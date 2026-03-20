import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCreditEconomy } from "@/hooks/useCreditEconomy";
import { Coins, ArrowDownCircle, ArrowUpCircle, Package } from "lucide-react";

const CreditEconomy = () => {
  const { packs, transactions, currentBalance, todayUsage, isLoading } = useCreditEconomy();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usage Credit Economy</h1>
          <p className="text-muted-foreground">Daily credits, purchase packs, and usage forecasts.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-4 text-center">
            <Coins className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{currentBalance}</p>
            <p className="text-xs text-muted-foreground">Current Balance</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <ArrowDownCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold">{todayUsage}</p>
            <p className="text-xs text-muted-foreground">Used Today</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Package className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{packs.length}</p>
            <p className="text-xs text-muted-foreground">Packs Available</p>
          </CardContent></Card>
        </div>

        {/* Credit Packs */}
        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold text-foreground mb-3">Credit Packs</h3>
            {packs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No credit packs available at this time.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {packs.map(p => (
                  <div key={p.id} className="rounded-lg border border-border p-4 text-center">
                    <p className="font-bold text-foreground">{p.name}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{p.credits} credits</p>
                    <p className="text-sm text-muted-foreground">${(p.price_cents / 100).toFixed(2)}</p>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold text-foreground mb-3">Recent Transactions</h3>
            {transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 20).map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      {t.amount >= 0 ? <ArrowUpCircle className="h-4 w-4 text-primary" /> : <ArrowDownCircle className="h-4 w-4 text-destructive" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.description || t.transaction_type}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${t.amount >= 0 ? "text-primary" : "text-destructive"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</p>
                      <p className="text-xs text-muted-foreground">Bal: {t.balance_after}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CreditEconomy;
