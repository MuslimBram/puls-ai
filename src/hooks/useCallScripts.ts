import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface CallScript {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  description: string | null;
  script_type: "script" | "macro" | "objection_handler";
  content: ScriptStep[];
  tags: string[];
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScriptStep {
  id: string;
  type: "talk" | "question" | "objection" | "action" | "note";
  text: string;
  options?: string[];
}

export const useCallScripts = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const scriptsQuery = useQuery({
    queryKey: ["call-scripts", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_scripts")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        content: Array.isArray(d.content) ? d.content : [],
      })) as CallScript[];
    },
    enabled: !!workspace,
  });

  const createScript = useMutation({
    mutationFn: async (params: { name: string; scriptType: string; description?: string }) => {
      const { error } = await supabase.from("call_scripts").insert({
        workspace_id: workspace!.id,
        user_id: user!.id,
        name: params.name,
        description: params.description || null,
        script_type: params.scriptType,
        content: [],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-scripts"] });
      toast.success("Script created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateScript = useMutation({
    mutationFn: async (params: { id: string; content?: ScriptStep[]; name?: string; is_active?: boolean }) => {
      const update: any = { updated_at: new Date().toISOString() };
      if (params.content !== undefined) update.content = params.content;
      if (params.name !== undefined) update.name = params.name;
      if (params.is_active !== undefined) update.is_active = params.is_active;
      const { error } = await supabase.from("call_scripts").update(update).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-scripts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteScript = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("call_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-scripts"] });
      toast.success("Script deleted");
    },
  });

  const trackUsage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("increment_usage_count" as any, { script_id: id }).maybeSingle();
      // Fallback: manual increment
      if (error) {
        await supabase.from("call_scripts")
          .update({ usage_count: ((scriptsQuery.data?.find(s => s.id === id)?.usage_count ?? 0) + 1) } as any)
          .eq("id", id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-scripts"] }),
  });

  return {
    scripts: scriptsQuery.data ?? [],
    isLoading: scriptsQuery.isLoading,
    createScript,
    updateScript,
    deleteScript,
    trackUsage,
  };
};
