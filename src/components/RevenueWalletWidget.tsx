import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRevenueTransactions, useRevenueSplitConfig } from "@/hooks/useRevenueWallet";
import { usePartnerWallet } from "@/hooks/usePartnerWallet";
import { Wallet, TrendingUp, ArrowUpCircle, ArrowDownCircle, Percent } from "lucide-react";
import { format } from "date-fns";

interface RevenueWalletWidgetProps {
  partnerId?: string | null;
  walletType?: "freelancer" | "owner" | "platform";
}

export const RevenueWalletWidget = ({ partnerId, walletType = "freelancer" }: RevenueWalletWidgetProps) => {
  const { data: partnerWallet } = usePartnerWallet(walletType === "freelancer" ? partnerId ?? null : null);
  const { data: transactions = [] } = useRevenueTransactions(walletType);
  const { data: config } = useRevenueSplitConfig();

  const balance = walletType === "freelancer" && partnerWallet
    ? Number(partnerWallet.current_balance)
    : transactions.reduce((s, t: any) => s + Number(t.amount), 0);

  const lifetime = walletType === "freelancer" && partnerWallet
    ? Number(partnerWallet.lifetime_earnings)
    : transactions.filter((t: any) => Number(t.amount) > 0).reduce((s, t: any) => s + Number(t.amount), 0);

  const myPercent = config
    ? walletType === "platform" ? Number(config.platform_percent)
      : walletType === "owner" ? Number(config.owner_percent)
      : Number(config.freelancer_percent)
    : 0;

  const roleLabel = walletType === "platform" ? "Platform" : walletType === "owner" ? "Owner" : "Freelancer";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          {roleLabel} Revenue Wallet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">${balance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Balance</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-primary">${lifetime.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Lifetime</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Percent className="h-3 w-3 text-muted-foreground" />
              <p className="text-xl font-bold text-foreground">{myPercent}</p>
            </div>
            <p className="text-xs text-muted-foreground">Revenue Share</p>
          </div>
        </div>

        {transactions.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent Transactions</p>
            {transactions.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1.5">
                  {Number(t.amount) >= 0 ? (
                    <ArrowUpCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowDownCircle className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-xs text-foreground truncate max-w-[150px]">{t.description || t.transaction_type}</span>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium ${Number(t.amount) >= 0 ? "text-primary" : "text-destructive"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}${Number(t.amount).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
