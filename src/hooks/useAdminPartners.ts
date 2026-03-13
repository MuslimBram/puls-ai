import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/components/ui/sonner";

export const useAdminPartners = () => {
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const { log } = useAuditLog();

  const partnersQuery = useQuery({
    queryKey: ["admin-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  const approvePartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from("partner_accounts")
        .update({ status: "active" })
        .eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: async (_, partnerId) => {
      await log("partner_approved", "partner", partnerId);
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success("Partner approved");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const rejectPartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from("partner_accounts")
        .update({ status: "rejected" })
        .eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: async (_, partnerId) => {
      await log("partner_rejected", "partner", partnerId);
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success("Partner rejected");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  return {
    partners: partnersQuery.data ?? [],
    approvePartner,
    rejectPartner,
  };
};