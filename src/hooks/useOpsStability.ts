import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export const useOpsStability = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const healthChecks = useQuery({
    queryKey: ["ops-health-checks", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_health_checks").select("*").order("checked_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const checks = healthChecks.data ?? [];
  const healthy = checks.filter(c => c.status === "healthy").length;
  const degraded = checks.filter(c => c.status === "degraded").length;
  const down = checks.filter(c => c.status === "down").length;
  const avgLatency = checks.length ? Math.round(checks.reduce((s, c) => s + (c.latency_ms ?? 0), 0) / checks.length) : 0;

  return { checks, healthy, degraded, down, avgLatency, isLoading: healthChecks.isLoading };
};
