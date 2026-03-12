import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CredentialFieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
}

export interface ChannelRegistryItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_available: boolean;
  icon: string | null;
  config_schema: any;
  integration_status: string;
  setup_instructions: string | null;
  credential_fields: CredentialFieldDef[];
}

export const useChannelRegistry = () => {
  const query = useQuery({
    queryKey: ["channel-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_registry")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((item) => ({
        ...item,
        credential_fields: Array.isArray(item.credential_fields) ? item.credential_fields : [],
      })) as ChannelRegistryItem[];
    },
  });

  return { registry: query.data ?? [], isLoading: query.isLoading };
};
