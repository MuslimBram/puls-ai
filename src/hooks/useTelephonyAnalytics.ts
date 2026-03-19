import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { startOfDay, subDays, format } from "date-fns";

export interface TelephonyMetrics {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  avgDuration: number;
  missedCalls: number;
  completedCalls: number;
  avgWaitTime: number;
  callsByDay: { date: string; inbound: number; outbound: number }[];
  callsByStatus: { status: string; count: number }[];
  topCallers: { phone: string; name: string | null; count: number }[];
}

export const useTelephonyAnalytics = (days = 30) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["telephony-analytics", workspace?.id, days],
    queryFn: async (): Promise<TelephonyMetrics> => {
      const since = subDays(new Date(), days).toISOString();

      const { data: records, error } = await supabase
        .from("call_records")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      const calls = (records ?? []) as any[];

      const inbound = calls.filter((c) => c.call_direction === "inbound");
      const outbound = calls.filter((c) => c.call_direction === "outbound");
      const completed = calls.filter((c) => c.call_status === "completed");
      const missed = calls.filter((c) => ["missed", "failed", "no_answer"].includes(c.call_status));

      const durations = completed.map((c) => c.call_duration || 0).filter((d: number) => d > 0);
      const avgDuration = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;

      // Calls by day
      const dayMap: Record<string, { inbound: number; outbound: number }> = {};
      for (let i = 0; i < Math.min(days, 14); i++) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        dayMap[d] = { inbound: 0, outbound: 0 };
      }
      calls.forEach((c) => {
        const d = format(new Date(c.created_at), "yyyy-MM-dd");
        if (dayMap[d]) {
          if (c.call_direction === "inbound") dayMap[d].inbound++;
          else dayMap[d].outbound++;
        }
      });
      const callsByDay = Object.entries(dayMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // By status
      const statusMap: Record<string, number> = {};
      calls.forEach((c) => {
        statusMap[c.call_status] = (statusMap[c.call_status] || 0) + 1;
      });
      const callsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

      // Top callers
      const callerMap: Record<string, { name: string | null; count: number }> = {};
      calls.forEach((c) => {
        const phone = c.contact_phone || "Unknown";
        if (!callerMap[phone]) callerMap[phone] = { name: c.contact_name, count: 0 };
        callerMap[phone].count++;
      });
      const topCallers = Object.entries(callerMap)
        .map(([phone, v]) => ({ phone, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalCalls: calls.length,
        inboundCalls: inbound.length,
        outboundCalls: outbound.length,
        avgDuration: Math.round(avgDuration),
        missedCalls: missed.length,
        completedCalls: completed.length,
        avgWaitTime: 0,
        callsByDay,
        callsByStatus,
        topCallers,
      };
    },
    enabled: !!workspace,
  });
};
