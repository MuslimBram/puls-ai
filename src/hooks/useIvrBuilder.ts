import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface IvrNode {
  id: string;
  type: "greeting" | "menu" | "transfer" | "voicemail" | "time_check" | "play_message" | "hangup";
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface IvrEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface IvrFlow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  nodes: IvrNode[];
  edges: IvrEdge[];
  settings: Record<string, unknown>;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useIvrBuilder = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const flowsQuery = useQuery({
    queryKey: ["ivr-flows", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ivr_flows")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IvrFlow[];
    },
    enabled: !!workspace,
  });

  const createFlow = useMutation({
    mutationFn: async (params: { name: string; description?: string }) => {
      const defaultNodes: IvrNode[] = [
        {
          id: "greeting-1",
          type: "greeting",
          label: "Welcome",
          x: 100,
          y: 100,
          config: { message: "Welcome to our service. Please listen carefully to the following options." },
        },
        {
          id: "menu-1",
          type: "menu",
          label: "Main Menu",
          x: 100,
          y: 250,
          config: {
            prompt: "Press 1 for Sales, 2 for Support, 3 to leave a message.",
            options: [
              { digit: "1", label: "Sales" },
              { digit: "2", label: "Support" },
              { digit: "3", label: "Voicemail" },
            ],
          },
        },
      ];
      const defaultEdges: IvrEdge[] = [
        { id: "e-greeting-menu", source: "greeting-1", target: "menu-1", label: "next" },
      ];
      const { data, error } = await supabase
        .from("ivr_flows")
        .insert({
          workspace_id: workspace!.id,
          name: params.name,
          description: params.description || null,
          nodes: defaultNodes,
          edges: defaultEdges,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as IvrFlow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ivr-flows"] });
      toast.success("IVR flow created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFlow = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<IvrFlow> & { id: string }) => {
      const { error } = await supabase
        .from("ivr_flows")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ivr-flows"] });
      toast.success("Flow saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishFlow = useMutation({
    mutationFn: async (flowId: string) => {
      // Deactivate other flows first
      await supabase
        .from("ivr_flows")
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq("workspace_id", workspace!.id);

      const { error } = await supabase
        .from("ivr_flows")
        .update({
          is_active: true,
          published_at: new Date().toISOString(),
          version: (flowsQuery.data?.find((f) => f.id === flowId)?.version ?? 0) + 1,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ivr-flows"] });
      toast.success("Flow published");
    },
  });

  const deleteFlow = useMutation({
    mutationFn: async (flowId: string) => {
      const { error } = await supabase.from("ivr_flows").delete().eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ivr-flows"] });
      toast.success("Flow deleted");
    },
  });

  return {
    flows: flowsQuery.data ?? [],
    isLoading: flowsQuery.isLoading,
    createFlow,
    updateFlow,
    publishFlow,
    deleteFlow,
  };
};
