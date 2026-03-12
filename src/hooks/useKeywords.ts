import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export const useKeywords = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["keywords", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("keywords")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addKeyword = useMutation({
    mutationFn: async (keyword: string) => {
      // Server-side limit enforcement
      const { data: limitCheck, error: limitError } = await supabase.functions.invoke("enforce-limits", {
        body: { action: "add", resource: "keywords" },
      });
      if (limitError) throw new Error(limitError.message || "Failed to check limits");
      if (limitCheck && !limitCheck.allowed) {
        throw new Error(limitCheck.error || "Keyword limit reached. Please upgrade your plan.");
      }

      const { error } = await supabase
        .from("keywords")
        .insert({ keyword: keyword.toLowerCase().trim(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      toast.success("Keyword added");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleKeyword = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("keywords").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["keywords"] }),
  });

  const deleteKeyword = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("keywords").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      toast.success("Keyword removed");
    },
    onError: (e) => toast.error(e.message),
  });

  return { keywords: query.data ?? [], isLoading: query.isLoading, addKeyword, toggleKeyword, deleteKeyword };
};
