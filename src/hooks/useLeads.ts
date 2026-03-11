import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface LeadFilters {
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export const useLeads = (filters: LeadFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["leads", user?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("*")
        .eq("user_id", user!.id)
        .order("message_date", { ascending: false });

      if (filters.keyword) q = q.eq("detected_keyword", filters.keyword);
      if (filters.dateFrom) q = q.gte("message_date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_date", filters.dateTo);
      if (filters.status) q = q.eq("status", filters.status);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
    },
  });

  return { leads: query.data ?? [], isLoading: query.isLoading, updateStatus };
};
