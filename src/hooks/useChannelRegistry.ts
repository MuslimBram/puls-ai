import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelRegistryItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_available: boolean;
  icon: string | null;
  config_schema: any;
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
      return data as ChannelRegistryItem[];
    },
  });

  return { registry: query.data ?? [], isLoading: query.isLoading };
};
