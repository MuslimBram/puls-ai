import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useLeadMagnets = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

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

  const createMagnet = useMutation({
    mutationFn: async (input: { name: string; magnet_type: string; content_config?: any }) => {
      const { data, error } = await supabase.from("lead_magnets").insert({
        user_id: user!.id,
        workspace_id: workspace?.id,
        ...input,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Lead magnet created");
      qc.invalidateQueries({ queryKey: ["lead-magnets"] });
    },
  });

  const totalCaptures = captures.data?.length ?? 0;
  const avgConversion = magnets.data?.length
    ? (magnets.data.reduce((s, m) => s + Number(m.conversion_rate ?? 0), 0) / magnets.data.length).toFixed(1)
    : "0";

  return { magnets: magnets.data ?? [], captures: captures.data ?? [], createMagnet, totalCaptures, avgConversion, isLoading: magnets.isLoading };
};
