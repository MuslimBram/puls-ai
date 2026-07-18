// src/components/dashboard/AdsSpendWidget.tsx
// ============================================================
// CEO Dashboard: Meta Ads + Google Ads spend, leads, ROAS proxy.
// Tërheq nga *_ads_cache; buton Sync thërret edge functions.
// ============================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, RefreshCw, TrendingUp, DollarSign, MousePointerClick, Target } from "lucide-react";
import { useMetaAds, useGoogleAds, useSyncAds } from "@/hooks/useAdsSpend";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface ProviderCardProps {
  title: string;
  icon: React.ReactNode;
  provider: "meta" | "google";
  resultLabel: string;
  data: ReturnType<typeof useMetaAds>["data"];
  isLoading: boolean;
  onSync: () => void;
  syncing: boolean;
}

const ProviderCard = ({ title, icon, provider, resultLabel, data, isLoading, onSync, syncing }: ProviderCardProps) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {data ? `${data.date_start} → ${data.date_stop}` : "No data synced yet"}
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onSync}
          disabled={syncing}
          aria-label={`Sync ${title}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded bg-muted/40" />
      ) : !data ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          Click sync to pull the last 30 days.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Metric icon={<DollarSign className="h-3.5 w-3.5" />} label="Spend" value={fmtMoney(data.spend)} highlight />
          <Metric icon={<Target className="h-3.5 w-3.5" />} label={resultLabel} value={fmt(data.leads_or_conversions)} />
          <Metric icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Clicks" value={fmt(data.clicks)} />
          <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="CTR" value={`${data.ctr.toFixed(2)}%`} />
          <div className="col-span-2 flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-xs text-muted-foreground">Cost / {resultLabel.toLowerCase()}</span>
            <Badge variant="secondary" className="text-xs">
              {data.leads_or_conversions > 0 ? fmtMoney(data.cost_per_result) : "—"}
            </Badge>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

const Metric = ({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) => (
  <div className="rounded-md border border-border p-2">
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <p className={`mt-0.5 font-bold ${highlight ? "text-lg text-foreground" : "text-sm text-foreground"}`}>{value}</p>
  </div>
);

// Simple inline Google icon (lucide has no brand icon)
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1Z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
    <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
  </svg>
);

export const AdsSpendWidget = () => {
  const meta = useMetaAds();
  const google = useGoogleAds();
  const sync = useSyncAds();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ad Spend</h2>
          <p className="text-xs text-muted-foreground">Last 30 days across Meta &amp; Google Ads</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderCard
          title="Meta Ads"
          icon={<Facebook className="h-4 w-4 text-blue-500" />}
          provider="meta"
          resultLabel="Leads"
          data={meta.data}
          isLoading={meta.isLoading}
          onSync={() => sync.mutate("meta")}
          syncing={sync.isPending && sync.variables === "meta"}
        />
        <ProviderCard
          title="Google Ads"
          icon={<GoogleIcon />}
          provider="google"
          resultLabel="Conversions"
          data={google.data}
          isLoading={google.isLoading}
          onSync={() => sync.mutate("google")}
          syncing={sync.isPending && sync.variables === "google"}
        />
      </div>
    </div>
  );
};
