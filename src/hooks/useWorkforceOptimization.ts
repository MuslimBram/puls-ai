import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useWorkforceOptimization = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const uid = user?.id;
  const wid = workspace?.id;

  const utilization = useQuery({
    queryKey: ["agent-utilization", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_utilization")
        .select("*")
        .eq("user_id", uid!)
        .order("measurement_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const alerts = useQuery({
    queryKey: ["capacity-alerts", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capacity_alerts")
        .select("*")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const analytics = useQuery({
    queryKey: ["workforce-analytics", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workforce_analytics")
        .select("*")
        .eq("user_id", uid!)
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const generateUtilization = useMutation({
    mutationFn: async () => {
      const agents = [
        { agent_name: "Agent Alpha", active_conversation_minutes: 280, call_handling_minutes: 120, idle_minutes: 80, automation_coverage_pct: 35, efficiency_score: 82 },
        { agent_name: "Agent Beta", active_conversation_minutes: 190, call_handling_minutes: 200, idle_minutes: 130, automation_coverage_pct: 22, efficiency_score: 68 },
        { agent_name: "Agent Gamma", active_conversation_minutes: 340, call_handling_minutes: 60, idle_minutes: 40, automation_coverage_pct: 48, efficiency_score: 91 },
      ];
      const rows = agents.map((a) => ({ ...a, user_id: uid!, workspace_id: wid, agent_user_id: uid!, measurement_date: new Date().toISOString().slice(0, 10) }));
      const { error } = await supabase.from("agent_utilization").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Utilization analysis generated"); qc.invalidateQueries({ queryKey: ["agent-utilization"] }); },
  });

  const resolveAlert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("capacity_alerts").update({ is_resolved: true, resolved_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alert resolved"); qc.invalidateQueries({ queryKey: ["capacity-alerts"] }); },
  });

  const generateAlerts = useMutation({
    mutationFn: async () => {
      const alertItems = [
        { alert_type: "overload", severity: "high", title: "Agent Beta overloaded", description: "Handling 3x average conversation volume with declining response quality" },
        { alert_type: "underutilized", severity: "low", title: "Agent Delta underutilized", description: "Only 30% capacity used during peak hours — consider reassignment" },
        { alert_type: "queue_congestion", severity: "medium", title: "Support queue congestion risk", description: "Queue wait time trending above SLA threshold for past 2 hours" },
      ];
      const rows = alertItems.map((a) => ({ ...a, user_id: uid!, workspace_id: wid }));
      const { error } = await supabase.from("capacity_alerts").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Capacity alerts generated"); qc.invalidateQueries({ queryKey: ["capacity-alerts"] }); },
  });

  return { utilization, alerts, analytics, generateUtilization, resolveAlert, generateAlerts };
};
