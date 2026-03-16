import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useToast } from "@/hooks/use-toast";

export interface BusinessRegistration {
  id: string;
  workspace_id: string | null;
  business_name: string;
  industry: string | null;
  business_data: Record<string, any>;
  package_type: string;
  discount_applied: number;
  discount_reason: string | null;
  referral_code_used: string | null;
  review_status: string;
  review_notes: string | null;
  created_by_user_id: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useBusinessRegistrations = (filter?: { status?: string; creatorOnly?: boolean }) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-registrations", filter],
    queryFn: async () => {
      let query = supabase
        .from("business_registrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter?.status) {
        query = query.eq("review_status", filter.status);
      }
      if (filter?.creatorOnly && user) {
        query = query.eq("created_by_user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as BusinessRegistration[];
    },
    enabled: !!user,
  });
};

export const useCreateBusinessRegistration = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      business_name: string;
      industry?: string;
      package_type?: string;
      discount_applied?: number;
      discount_reason?: string;
      referral_code_used?: string;
      business_data?: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from("business_registrations")
        .insert({
          ...input,
          created_by_user_id: user!.id,
          review_status: "draft",
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      // Log discount if applied
      if (input.discount_applied && input.discount_applied > 0) {
        await supabase.from("discount_audit_log").insert({
          registration_id: data.id,
          action: "discount_applied",
          actor_id: user!.id,
          details: {
            discount_percent: input.discount_applied,
            reason: input.discount_reason,
            package_type: input.package_type,
          },
        } as any);
      }

      // Log referral usage
      if (input.referral_code_used) {
        await supabase.from("discount_audit_log").insert({
          registration_id: data.id,
          action: "referral_used",
          actor_id: user!.id,
          details: { referral_code: input.referral_code_used },
        } as any);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-registrations"] });
      toast({ title: "Business registered", description: "Draft created. Submit for review when ready." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useSubmitForReview = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (registrationId: string) => {
      const { error } = await supabase
        .from("business_registrations")
        .update({ review_status: "submitted_for_review", updated_at: new Date().toISOString() } as any)
        .eq("id", registrationId)
        .eq("created_by_user_id", user!.id);
      if (error) throw error;

      await supabase.from("discount_audit_log").insert({
        registration_id: registrationId,
        action: "submitted_for_review",
        actor_id: user!.id,
        details: {},
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-registrations"] });
      toast({ title: "Submitted", description: "Business registration submitted for review." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useReviewRegistration = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { log } = useAuditLog();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      registrationId,
      status,
      notes,
    }: {
      registrationId: string;
      status: "approved" | "rejected" | "needs_changes";
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("business_registrations")
        .update({
          review_status: status,
          review_notes: notes || null,
          reviewed_by_user_id: user!.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", registrationId);
      if (error) throw error;

      await supabase.from("discount_audit_log").insert({
        registration_id: registrationId,
        action: `registration_${status}`,
        actor_id: user!.id,
        details: { notes },
      } as any);

      await log(`business_${status}`, "business_registration", registrationId, { notes });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["business-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast({ title: `Registration ${status}` });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useDiscountAuditLog = (registrationId?: string) => {
  return useQuery({
    queryKey: ["discount-audit-log", registrationId],
    queryFn: async () => {
      let query = supabase
        .from("discount_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (registrationId) {
        query = query.eq("registration_id", registrationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
};
