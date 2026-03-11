import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface BusinessProfileData {
  business_name: string;
  short_description: string;
  industry: string;
  target_audience: string;
  mission_values: string;
  main_services: string;
  ai_tone: string;
  language: string;
}

export const useBusinessProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["business-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async (values: BusinessProfileData) => {
      if (query.data) {
        const { error } = await supabase
          .from("business_profiles")
          .update(values)
          .eq("id", query.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("business_profiles")
          .insert({ ...values, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      toast.success("Business profile saved");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return { profile: query.data, isLoading: query.isLoading, upsert };
};
