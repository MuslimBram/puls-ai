import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

export type IndustryPack = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  version: string;
  install_count: number;
  contents: {
    pipeline?: { name: string; stages: { name: string; color?: string }[] };
    automations?: { name: string; trigger_type: string; actions: unknown[] }[];
    broadcasts?: { name: string; channel: string; body: string }[];
    knowledge?: { title: string; content: string }[];
    widgets?: { key: string; title: string; metric: string }[];
  };
};

export type WorkspaceIndustryPack = {
  id: string;
  workspace_id: string;
  pack_id: string;
  business_id: string | null;
  status: string;
  install_log: Record<string, unknown>;
  installed_at: string;
  industry_packs?: IndustryPack;
};

export function useIndustryPacks() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();

  const packsQuery = useQuery({
    queryKey: ["industry-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("industry_packs" as any)
        .select("*")
        .eq("is_published", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as IndustryPack[];
    },
    enabled: !!user,
  });

  const installedQuery = useQuery({
    queryKey: ["workspace-industry-packs", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_industry_packs" as any)
        .select("*, industry_packs(*)")
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
      return (data ?? []) as unknown as WorkspaceIndustryPack[];
    },
    enabled: !!workspace,
  });

  const installPack = useMutation({
    mutationFn: async ({
      pack_slug,
      business_id,
    }: {
      pack_slug: string;
      business_id?: string;
    }) => {
      if (!workspace) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke(
        "install-industry-pack",
        {
          body: { pack_slug, workspace_id: workspace.id, business_id },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as {
        ok: boolean;
        install_id: string;
        summary: Record<string, number>;
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["workspace-industry-packs"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
      qc.invalidateQueries({ queryKey: ["automation-workflows"] });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      toast({
        title: "Pack installed",
        description: `${res.summary.pipeline_stages} stages · ${res.summary.automations} automations · ${res.summary.broadcast_templates} templates · ${res.summary.knowledge_entries} KB entries`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Install failed", description: e.message, variant: "destructive" }),
  });

  const uninstallPack = useMutation({
    mutationFn: async (install_id: string) => {
      const { error } = await supabase
        .from("workspace_industry_packs" as any)
        .delete()
        .eq("id", install_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-industry-packs"] });
      toast({ title: "Pack removed", description: "Generated items remain in your workspace." });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return {
    packs: packsQuery.data ?? [],
    installed: installedQuery.data ?? [],
    isLoading: packsQuery.isLoading || installedQuery.isLoading,
    installPack,
    uninstallPack,
  };
}
