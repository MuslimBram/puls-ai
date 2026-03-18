import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/hooks/use-toast";
import { useActiveBusinessProfile } from "@/hooks/useBusinessProfile";

export interface ScanInsight {
  id: string;
  source_id: string;
  workspace_id: string;
  scan_id: string;
  user_id: string;
  insight_type: string;
  title: string;
  description: string | null;
  raw_value_json: Record<string, unknown>;
  confidence_score: number;
  is_important: boolean;
  created_at: string;
}

export const useScanInsights = (sourceId?: string, scanId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { profile: activeBusiness } = useActiveBusinessProfile();
  const qc = useQueryClient();

  const qk = ["scan-insights", sourceId, scanId, activeBusiness?.id];

  const query = useQuery({
    queryKey: qk,
    enabled: !!user && !!workspace && !!sourceId && !!activeBusiness?.id,
    queryFn: async () => {
      let q = supabase
        .from("scan_insights")
        .select("*")
        .eq("source_id", sourceId!)
        .eq("business_id", activeBusiness!.id)
        .order("confidence_score", { ascending: false });

      if (scanId) q = q.eq("scan_id", scanId);

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ScanInsight[];
    },
  });

  const toggleImportant = useMutation({
    mutationFn: async ({ id, is_important }: { id: string; is_important: boolean }) => {
      const { error } = await supabase
        .from("scan_insights")
        .update({ is_important } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const grouped = (query.data || []).reduce<Record<string, ScanInsight[]>>((acc, i) => {
    if (!acc[i.insight_type]) acc[i.insight_type] = [];
    acc[i.insight_type].push(i);
    return acc;
  }, {});

  return {
    insights: query.data ?? [],
    grouped,
    isLoading: query.isLoading,
    toggleImportant,
  };
};

export const useScanHistory = (sourceId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useQuery({
    queryKey: ["scan-history", sourceId, activeBusiness?.id],
    enabled: !!user && !!workspace && !!sourceId && !!activeBusiness?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_scans")
        .select("*")
        .eq("source_id", sourceId!)
        .eq("business_id", activeBusiness!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as any[];
    },
  });
};
