// src/hooks/useAdsSpend.ts
// ============================================================
// Merr të dhënat më të fundit të Meta + Google Ads
// nga meta_ads_cache / google_ads_cache (RLS = workspace_id = auth.uid()).
// Ekspozon edhe funksione për të triguar sync manual.
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface AdsMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads_or_conversions: number;
  cost_per_result: number;
  ctr: number;
  date_start: string;
  date_stop: string;
  synced_at: string;
}

export const useMetaAds = () =>
  useQuery({
    queryKey: ["meta-ads-latest"],
    queryFn: async (): Promise<AdsMetrics | null> => {
      const { data, error } = await supabase
        .from("meta_ads_cache")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        spend: Number(data.spend ?? 0),
        impressions: Number(data.impressions ?? 0),
        clicks: Number(data.clicks ?? 0),
        leads_or_conversions: Number(data.leads_count ?? 0),
        cost_per_result: Number(data.cost_per_lead ?? 0),
        ctr: Number(data.ctr ?? 0),
        date_start: data.date_start,
        date_stop: data.date_stop,
        synced_at: data.synced_at,
      };
    },
  });

export const useGoogleAds = () =>
  useQuery({
    queryKey: ["google-ads-latest"],
    queryFn: async (): Promise<AdsMetrics | null> => {
      const { data, error } = await supabase
        .from("google_ads_cache" as never)
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as Record<string, unknown>;
      return {
        spend: Number(d.spend ?? 0),
        impressions: Number(d.impressions ?? 0),
        clicks: Number(d.clicks ?? 0),
        leads_or_conversions: Number(d.conversions ?? 0),
        cost_per_result: Number(d.cost_per_conv ?? 0),
        ctr: Number(d.ctr ?? 0),
        date_start: d.date_start as string,
        date_stop: d.date_stop as string,
        synced_at: d.synced_at as string,
      };
    },
  });

export const useSyncAds = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: "meta" | "google") => {
      const fn = provider === "meta" ? "sync-meta-ads" : "sync-google-ads";
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: (_d, provider) => {
      toast({ title: "Ads synced", description: `${provider === "meta" ? "Meta" : "Google"} Ads updated.` });
      qc.invalidateQueries({ queryKey: [`${provider === "meta" ? "meta" : "google"}-ads-latest`] });
    },
    onError: (err: Error) => {
      toast({
        title: "Sync failed",
        description: err.message.includes("not configured")
          ? "Ads credentials not configured. Contact owner."
          : err.message,
        variant: "destructive",
      });
    },
  });
};
