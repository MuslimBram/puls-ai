import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useAIDecisions = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const actions = useQuery({
    queryKey: ["ai-suggested-actions", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_suggested_actions").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const executeAction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_suggested_actions").update({ status: "executed", executed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Action executed");
      qc.invalidateQueries({ queryKey: ["ai-suggested-actions"] });
    },
  });

  const dismissAction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_suggested_actions").update({ status: "dismissed", dismissed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-suggested-actions"] });
    },
  });

  const pending = (actions.data ?? []).filter(a => a.status === "pending");
  const executed = (actions.data ?? []).filter(a => a.status === "executed");

  return { actions: actions.data ?? [], pending, executed, executeAction, dismissAction, isLoading: actions.isLoading };
};
