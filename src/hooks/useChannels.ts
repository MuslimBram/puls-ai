import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";
import type { ChannelCapability, ConnectionMode, AccountType } from "@/hooks/useChannelCapabilities";

export interface ChannelData {
  channel_type: string;
  channel_name: string;
  connection_mode?: ConnectionMode;
  account_type?: AccountType;
  capabilities?: ChannelCapability[];
  provider_metadata?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  business_id?: string; // R111-C1: Explicit business binding
}

export interface ChannelSaveResult {
  ok: true;
  channel_id: string;
  configured_credential_keys: string[];
}

const SAFE_CHANNEL_COLUMNS = [
  "id",
  "user_id",
  "workspace_id",
  "business_id",
  "channel_type",
  "channel_name",
  "connection_mode",
  "account_type",
  "capabilities",
  "provider_metadata",
  "is_enabled",
  "connection_status",
  "last_error",
  "created_at",
  "updated_at",
].join(",");

export const useChannels = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["channels", user?.id, workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select(SAFE_CHANNEL_COLUMNS)
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Deliberately never select settings or credentials_encrypted into the
      // browser. Empty compatibility properties keep legacy UI consumers from
      // attempting to display secrets while they migrate to masked status APIs.
      return (data ?? []).map((row) => ({
        ...row,
        settings: {} as Record<string, unknown>,
        credentials_encrypted: {} as Record<string, unknown>,
      }));
    },
    enabled: !!user && !!workspace?.id,
  });

  const addChannel = useMutation({
    mutationFn: async (channel: ChannelData): Promise<ChannelSaveResult> => {
      if (!workspace?.id) throw new Error("Select a workspace before connecting a channel.");

      const existing = query.data?.some((row) => row.channel_type === channel.channel_type) ?? false;
      if (!existing) {
        const { data: limitCheck, error: limitError } = await supabase.functions.invoke("enforce-limits", {
          body: { action: "add", resource: "channels" },
        });
        if (limitError) throw new Error(limitError.message || "Failed to check limits");
        if (limitCheck && !limitCheck.allowed) {
          throw new Error(limitCheck.error || "Channel limit reached. Please upgrade your plan.");
        }
      }

      // SECURITY: all channel writes flow through the server-side credential
      // writer. The server decides which fields are sensitive and encrypts them;
      // the browser never writes settings/credentials_encrypted directly.
      const { data, error } = await supabase.functions.invoke("save-channel-credentials", {
        body: {
          action: "save_generic",
          workspace_id: workspace.id,
          channel_type: channel.channel_type,
          channel_name: channel.channel_name,
          connection_mode: channel.connection_mode || "professional",
          account_type: channel.account_type || "unknown",
          capabilities: channel.capabilities || [],
          provider_metadata: channel.provider_metadata || {},
          settings: channel.settings || {},
          business_id: channel.business_id || null, // R111-C1: Explicit business binding
        },
      });
      if (error) throw new Error(error.message || "Failed to save channel securely");
      if (!data?.ok || !data?.channel_id) throw new Error(data?.error || "Failed to save channel securely");

      return {
        ok: true,
        channel_id: String(data.channel_id),
        configured_credential_keys: Array.isArray(data.configured_credential_keys)
          ? data.configured_credential_keys.map(String)
          : [],
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["connected-channels"] });
      toast.success("Channel added");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateChannel = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChannelData>) => {
      const { error } = await supabase
        .from("channels")
        .update({
          ...(updates.connection_mode && { connection_mode: updates.connection_mode }),
          ...(updates.account_type && { account_type: updates.account_type }),
          ...(updates.capabilities && { capabilities: updates.capabilities as any }),
          ...(updates.provider_metadata && { provider_metadata: updates.provider_metadata as any }),
          ...(updates.business_id && { business_id: updates.business_id }), // R111-C1: Allow business update
        })
        .eq("id", id)
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["connected-channels"] });
      toast.success("Channel updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      if (!workspace?.id) throw new Error("Workspace required");
      const { error } = await supabase
        .from("channels")
        .update({ is_enabled })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Workspace required");
      const { error } = await supabase
        .from("channels")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["connected-channels"] });
      toast.success("Channel removed");
    },
    onError: (error) => toast.error(error.message),
  });

  return {
    channels: query.data ?? [],
    isLoading: query.isLoading,
    addChannel,
    updateChannel,
    toggleChannel,
    deleteChannel,
  };
};
