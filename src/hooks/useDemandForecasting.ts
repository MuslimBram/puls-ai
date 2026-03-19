import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useDemandForecasting = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const uid = user?.id;
  const wid = workspace?.id;

  const forecasts = useQuery({
    queryKey: ["demand-forecasts", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demand_forecasts")
        .select("*")
        .eq("user_id", uid!)
        .order("period_start", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const planningItems = useQuery({
    queryKey: ["resource-planning", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_planning_items")
        .select("*")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const forecastAnalytics = useQuery({
    queryKey: ["forecast-analytics", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_analytics")
        .select("*")
        .eq("user_id", uid!)
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const generateForecasts = useMutation({
    mutationFn: async () => {
      const today = new Date();
      const forecasts = [
        { forecast_type: "lead_volume", period_start: today.toISOString().slice(0, 10), period_end: new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10), predicted_value: 245, confidence: 0.78, factors: { seasonal_trend: "rising", campaign_effect: 1.2, channel_momentum: "stable" } },
        { forecast_type: "call_center_load", period_start: today.toISOString().slice(0, 10), period_end: new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10), predicted_value: 180, confidence: 0.82, factors: { peak_hours: ["10:00-12:00", "14:00-16:00"], queue_risk: "medium", agent_capacity: 5 } },
        { forecast_type: "campaign_demand", period_start: today.toISOString().slice(0, 10), period_end: new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10), predicted_value: 3200, confidence: 0.71, factors: { rising_topics: ["AI automation", "cost savings"], content_momentum: "high" } },
      ];
      const rows = forecasts.map((f) => ({ ...f, user_id: uid!, workspace_id: wid }));
      const { error } = await supabase.from("demand_forecasts").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Demand forecasts generated"); qc.invalidateQueries({ queryKey: ["demand-forecasts"] }); },
  });

  const completePlanningItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resource_planning_items").update({ status: "completed", completed_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item completed"); qc.invalidateQueries({ queryKey: ["resource-planning"] }); },
  });

  const generatePlanningItems = useMutation({
    mutationFn: async () => {
      const items = [
        { suggestion_type: "staffing", title: "Add 2 agents for peak hours", description: "Forecast indicates call volume spike during 10AM-12PM window", priority: "high" },
        { suggestion_type: "automation", title: "Increase chatbot coverage for FAQs", description: "40% of incoming queries are repetitive and automatable", priority: "medium" },
        { suggestion_type: "scheduling", title: "Extend evening shift by 1 hour", description: "Growing lead activity detected between 6-8PM", priority: "medium" },
      ];
      const rows = items.map((i) => ({ ...i, user_id: uid!, workspace_id: wid }));
      const { error } = await supabase.from("resource_planning_items").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Planning suggestions generated"); qc.invalidateQueries({ queryKey: ["resource-planning"] }); },
  });

  return { forecasts, planningItems, forecastAnalytics, generateForecasts, completePlanningItem, generatePlanningItems };
};
