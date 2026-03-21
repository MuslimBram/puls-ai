import { useUserQuery } from "@/hooks/useSupabaseQuery";

export const useRevenueAttribution = () =>
  useUserQuery("revenue_attribution", "revenue-attribution", {
    orderBy: "attributed_at",
    limit: 100,
  });

export const useProfitInsights = () =>
  useUserQuery("profit_insights", "profit-insights", {
    orderBy: "impact_score",
    limit: 20,
    filters: { is_dismissed: false },
  });

export const useRevenueForecasts = () =>
  useUserQuery("revenue_forecasts", "revenue-forecasts", {
    orderBy: "forecast_date",
    ascending: true,
    limit: 30,
  });
