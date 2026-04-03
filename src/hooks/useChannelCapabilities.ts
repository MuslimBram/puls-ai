import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ConnectionMode = "professional" | "personal";
export type AccountType = "business" | "creator" | "personal" | "unknown";
export type ChannelCapability =
  | "auto_post"
  | "manual_post"
  | "messaging"
  | "comments"
  | "analytics"
  | "notifications"
  | "inbox"
  | "scheduling"
  | "publishing";

export interface ChannelRegistryWithModes {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_available: boolean;
  icon: string | null;
  supported_modes: ConnectionMode[];
  professional_capabilities: ChannelCapability[];
  personal_capabilities: ChannelCapability[];
  credential_fields: any[];
  min_plan: string;
  help_url: string | null;
  integration_status: string;
  setup_instructions: string | null;
}

export interface ConnectedChannel {
  id: string;
  channel_type: string;
  channel_name: string;
  connection_mode: ConnectionMode;
  account_type: AccountType;
  capabilities: ChannelCapability[];
  connection_status: string;
  is_enabled: boolean;
  is_primary: boolean;
  reconnect_required: boolean;
  provider_metadata: Record<string, unknown>;
}

/** Fetch channel registry with mode/capability data */
export const useChannelRegistryWithModes = () => {
  return useQuery({
    queryKey: ["channel-registry-modes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_registry")
        .select("*")
        .order("category");
      if (error) throw error;
      return (data as any[]).map((r) => ({
        ...r,
        supported_modes: Array.isArray(r.supported_modes) ? r.supported_modes : ["professional"],
        professional_capabilities: Array.isArray(r.professional_capabilities) ? r.professional_capabilities : [],
        personal_capabilities: Array.isArray(r.personal_capabilities) ? r.personal_capabilities : [],
        credential_fields: Array.isArray(r.credential_fields) ? r.credential_fields : [],
      })) as ChannelRegistryWithModes[];
    },
  });
};

/** Check if a connected channel has a specific capability */
export const hasCapability = (
  channel: ConnectedChannel | null | undefined,
  capability: ChannelCapability
): boolean => {
  if (!channel) return false;
  return Array.isArray(channel.capabilities) && channel.capabilities.includes(capability);
};

/** Get capabilities for a given mode from registry */
export const getCapabilitiesForMode = (
  registry: ChannelRegistryWithModes | undefined,
  mode: ConnectionMode
): ChannelCapability[] => {
  if (!registry) return [];
  return mode === "professional"
    ? registry.professional_capabilities
    : registry.personal_capabilities;
};

/** Check if a channel supports a specific mode */
export const supportsMode = (
  registry: ChannelRegistryWithModes | undefined,
  mode: ConnectionMode
): boolean => {
  if (!registry) return false;
  return registry.supported_modes.includes(mode);
};

/** Hook to get connected channels with their capabilities */
export const useConnectedChannels = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["connected-channels", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((ch) => ({
        id: ch.id,
        channel_type: ch.channel_type,
        channel_name: ch.channel_name,
        connection_mode: ch.connection_mode || "professional",
        account_type: ch.account_type || "unknown",
        capabilities: Array.isArray(ch.capabilities) ? ch.capabilities : [],
        connection_status: ch.connection_status || "disconnected",
        is_enabled: ch.is_enabled,
        is_primary: ch.is_primary || false,
        reconnect_required: ch.reconnect_required || false,
        provider_metadata: ch.provider_metadata || {},
      })) as ConnectedChannel[];
    },
    enabled: !!user,
  });
};

/** Check if a connected channel is in professional mode */
export const isProfessionalMode = (channel: ConnectedChannel | null | undefined): boolean => {
  return channel?.connection_mode === "professional";
};

/** Check if a channel can be upgraded from personal to professional */
export const canUpgrade = (
  channel: ConnectedChannel | null | undefined,
  registry: ChannelRegistryWithModes | undefined
): boolean => {
  if (!channel || !registry) return false;
  return channel.connection_mode === "personal" && supportsMode(registry, "professional");
};
