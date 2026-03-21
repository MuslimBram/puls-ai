import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useInsertMutation } from "@/hooks/useSupabaseQuery";

export const useLeadMagnets = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const magnets = useQuery({
    queryKey: ["lead-magnets", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_magnets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const captures = useQuery({
    queryKey: ["lead-captures", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_captures").select("*").order("captured_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMagnet = useInsertMutation<{ name: string; magnet_type: string; content_config?: any }>(
    "lead_magnets",
    "lead-magnets",
    "Lead magnet created",
  );

  const totalCaptures = captures.data?.length ?? 0;
  const avgConversion = magnets.data?.length
    ? (magnets.data.reduce((s, m) => s + Number(m.conversion_rate ?? 0), 0) / magnets.data.length).toFixed(1)
    : "0";

  return { magnets: magnets.data ?? [], captures: captures.data ?? [], createMagnet, totalCaptures, avgConversion, isLoading: magnets.isLoading };
};
