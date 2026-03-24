import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export const useFreelancerRelations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const relations = useQuery({
    queryKey: ["freelancer-relations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freelancer_business_relations")
        .select("*")
        .or(`freelancer_user_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const requestRelation = useMutation({
    mutationFn: async ({
      business_workspace_id,
      relation_type,
    }: {
      business_workspace_id: string;
      relation_type: "referral" | "management";
    }) => {
      // First check eligibility
      const { data: check, error: checkError } = await supabase.functions.invoke(
        "check-duplicate-asset",
        {
          body: {
            freelancer_user_id: user!.id,
            business_workspace_id,
            relation_type,
          },
        }
      );
      if (checkError) throw new Error(checkError.message);
      if (check?.relation_check && !check.relation_check.allowed) {
        throw new Error(check.relation_check.reason);
      }

      const commissionRate = relation_type === "referral" ? 35 : 40;

      const { error } = await supabase
        .from("freelancer_business_relations")
        .insert({
          freelancer_user_id: user!.id,
          business_workspace_id,
          relation_type,
          commission_rate: commissionRate,
          status: "pending",
        } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["freelancer-relations"] });
      const msg =
        vars.relation_type === "referral"
          ? "Kërkesa për referim u dërgua për aprovim"
          : "Kërkesa për menaxhim u dërgua për aprovim";
      toast.success(msg);
    },
    onError: (e) => toast.error(e.message),
  });

  const approveRelation = useMutation({
    mutationFn: async (relationId: string) => {
      const { error } = await supabase
        .from("freelancer_business_relations")
        .update({
          status: "active",
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", relationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freelancer-relations"] });
      toast.success("Marrëdhënia u aprovua");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectRelation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("freelancer_business_relations")
        .update({
          status: "rejected",
          deactivation_reason: reason || "Refuzuar nga admini",
        } as any)
        .eq("id", relationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freelancer-relations"] });
      toast.success("Kërkesa u refuzua");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    relations: relations.data ?? [],
    isLoading: relations.isLoading,
    requestRelation,
    approveRelation,
    rejectRelation,
  };
};

export const useRegisteredAssets = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const assets = useQuery({
    queryKey: ["registered-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registered_assets")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const registerAsset = useMutation({
    mutationFn: async ({
      workspace_id,
      asset_type,
      asset_identifier,
      asset_name,
    }: {
      workspace_id: string;
      asset_type: string;
      asset_identifier: string;
      asset_name?: string;
    }) => {
      // Check for duplicates first
      const { data: check, error: checkError } = await supabase.functions.invoke(
        "check-duplicate-asset",
        {
          body: { asset_type, asset_identifier },
        }
      );
      if (checkError) throw new Error(checkError.message);
      if (check?.asset_check?.is_duplicate) {
        throw new Error(check.asset_check.message);
      }
      if (check?.is_suspicious && check.suspicious_signals?.length > 0) {
        toast.warning("⚠️ Sinjale dyshimi: " + check.suspicious_signals.join(", "));
      }

      const { error } = await supabase.from("registered_assets").insert({
        workspace_id,
        asset_type,
        asset_identifier: asset_identifier.trim().toLowerCase(),
        asset_name,
        registered_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registered-assets"] });
      toast.success("Aseti u regjistrua me sukses");
    },
    onError: (e) => toast.error(e.message),
  });

  const requestDeactivation = useMutation({
    mutationFn: async ({ asset_id, reason }: { asset_id: string; reason: string }) => {
      const { error } = await supabase.from("asset_deactivation_requests").insert({
        asset_id,
        requested_by: user!.id,
        reason,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deactivation-requests"] });
      toast.success("Kërkesa për çaktivizim u dërgua tek Adminët");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    assets: assets.data ?? [],
    isLoading: assets.isLoading,
    registerAsset,
    requestDeactivation,
  };
};

export const useDeactivationRequests = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const requests = useQuery({
    queryKey: ["deactivation-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_deactivation_requests")
        .select("*, registered_assets(*)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const reviewRequest = useMutation({
    mutationFn: async ({
      request_id,
      approved,
      review_notes,
    }: {
      request_id: string;
      approved: boolean;
      review_notes?: string;
    }) => {
      // Update request
      const { data: request, error: reqError } = await supabase
        .from("asset_deactivation_requests")
        .update({
          status: approved ? "approved" : "rejected",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes,
        } as any)
        .eq("id", request_id)
        .select("asset_id")
        .single();
      if (reqError) throw reqError;

      // If approved, deactivate the asset
      if (approved && request?.asset_id) {
        const { error: assetError } = await supabase
          .from("registered_assets")
          .update({
            is_active: false,
            deactivated_at: new Date().toISOString(),
            deactivated_by: user!.id,
            deactivation_reason: review_notes || "Aprovuar nga admini",
          } as any)
          .eq("id", request.asset_id);
        if (assetError) throw assetError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deactivation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["registered-assets"] });
      toast.success("Kërkesa u shqyrtua");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    requests: requests.data ?? [],
    isLoading: requests.isLoading,
    reviewRequest,
  };
};
