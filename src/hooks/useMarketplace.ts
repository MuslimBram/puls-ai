import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

export const useMarketplacePlugins = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();

  const pluginsQuery = useQuery({
    queryKey: ["marketplace-plugins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_plugins" as any)
        .select("*")
        .eq("is_published", true)
        .order("install_count", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const installedQuery = useQuery({
    queryKey: ["workspace-plugins", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_plugins" as any)
        .select("*, marketplace_plugins(*)")
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!workspace,
  });

  const installPlugin = useMutation({
    mutationFn: async (pluginId: string) => {
      const { error } = await supabase.from("workspace_plugins" as any).insert({
        workspace_id: workspace!.id,
        plugin_id: pluginId,
        installed_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-plugins"] });
      toast({ title: "Plugin installed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePlugin = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from("workspace_plugins" as any).update({ is_enabled } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-plugins"] }),
  });

  const uninstallPlugin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_plugins" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-plugins"] });
      toast({ title: "Plugin removed" });
    },
  });

  return {
    plugins: pluginsQuery.data || [],
    installed: installedQuery.data || [],
    isLoading: pluginsQuery.isLoading,
    installPlugin,
    togglePlugin,
    uninstallPlugin,
  };
};

export const useMarketplaceTemplates = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["marketplace-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_templates" as any)
        .select("*")
        .eq("is_published", true)
        .order("install_count", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const installTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from("workspace_templates" as any).insert({
        workspace_id: workspace!.id,
        template_id: templateId,
        installed_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-templates"] });
      toast({ title: "Template installed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { templates: templatesQuery.data || [], isLoading: templatesQuery.isLoading, installTemplate };
};

export const useMarketplaceAIPacks = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();

  const packsQuery = useQuery({
    queryKey: ["marketplace-ai-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_ai_packs" as any)
        .select("*")
        .eq("is_published", true)
        .order("install_count", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const installPack = useMutation({
    mutationFn: async ({ packId, businessId }: { packId: string; businessId?: string }) => {
      const { error } = await supabase.from("workspace_ai_packs" as any).insert({
        workspace_id: workspace!.id,
        ai_pack_id: packId,
        business_id: businessId || null,
        installed_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-ai-packs"] });
      toast({ title: "AI Pack installed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { packs: packsQuery.data || [], isLoading: packsQuery.isLoading, installPack };
};

export const useMarketplaceRatings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const rateItem = useMutation({
    mutationFn: async ({ itemType, itemId, rating, review }: { itemType: string; itemId: string; rating: number; review?: string }) => {
      const { error } = await supabase.from("marketplace_ratings" as any).upsert({
        user_id: user!.id,
        item_type: itemType,
        item_id: itemId,
        rating,
        review: review || null,
      } as any, { onConflict: "user_id,item_type,item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      toast({ title: "Rating submitted" });
    },
  });

  return { rateItem };
};
