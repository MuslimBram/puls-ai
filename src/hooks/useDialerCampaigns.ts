import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface DialerCampaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  dialer_mode: string;
  caller_id: string | null;
  queue_id: string | null;
  total_contacts: number;
  contacted: number;
  answered: number;
  no_answer: number;
  busy: number;
  failed: number;
  pacing_ratio: number;
  max_attempts: number;
  retry_interval_minutes: number;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: string[];
  script: string | null;
  disposition_codes: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DialerContact {
  id: string;
  campaign_id: string;
  phone_number: string;
  contact_name: string | null;
  contact_data: Record<string, unknown>;
  status: string;
  disposition: string | null;
  attempts: number;
  last_attempt_at: string | null;
  notes: string | null;
}

export const useDialerCampaigns = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const campaignsQuery = useQuery({
    queryKey: ["dialer-campaigns", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dialer_campaigns")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DialerCampaign[];
    },
    enabled: !!workspace,
  });

  const createCampaign = useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      dialer_mode: string;
      caller_id?: string;
      queue_id?: string;
      script?: string;
      max_attempts?: number;
      pacing_ratio?: number;
    }) => {
      const { data, error } = await supabase
        .from("dialer_campaigns")
        .insert({
          workspace_id: workspace!.id,
          created_by: user!.id,
          ...params,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DialerCampaign;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialer-campaigns"] });
      toast.success("Dialer campaign created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addContacts = useMutation({
    mutationFn: async ({ campaignId, contacts }: {
      campaignId: string;
      contacts: { phone_number: string; contact_name?: string; contact_data?: Record<string, unknown> }[];
    }) => {
      const rows = contacts.map((c) => ({
        campaign_id: campaignId,
        phone_number: c.phone_number,
        contact_name: c.contact_name || null,
        contact_data: c.contact_data || {},
      }));
      const { error } = await supabase.from("dialer_campaign_contacts").insert(rows as any);
      if (error) throw error;

      // Update total count
      await supabase
        .from("dialer_campaigns")
        .update({ total_contacts: rows.length, updated_at: new Date().toISOString() } as any)
        .eq("id", campaignId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialer-campaigns"] });
      qc.invalidateQueries({ queryKey: ["dialer-contacts"] });
      toast.success("Contacts added");
    },
  });

  const startCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("dialer_campaigns")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialer-campaigns"] });
      toast.success("Campaign started");
    },
  });

  const pauseCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("dialer_campaigns")
        .update({ status: "paused", updated_at: new Date().toISOString() } as any)
        .eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialer-campaigns"] });
      toast.info("Campaign paused");
    },
  });

  const dispositionContact = useMutation({
    mutationFn: async ({ contactId, disposition, notes }: {
      contactId: string;
      disposition: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("dialer_campaign_contacts")
        .update({
          disposition,
          status: "completed",
          notes: notes || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialer-contacts"] });
      toast.success("Disposition saved");
    },
  });

  // Contacts for a campaign
  const useCampaignContacts = (campaignId: string | null) =>
    useQuery({
      queryKey: ["dialer-contacts", campaignId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("dialer_campaign_contacts")
          .select("*")
          .eq("campaign_id", campaignId!)
          .order("created_at", { ascending: true })
          .limit(200);
        if (error) throw error;
        return (data ?? []) as unknown as DialerContact[];
      },
      enabled: !!campaignId,
    });

  return {
    campaigns: campaignsQuery.data ?? [],
    isLoading: campaignsQuery.isLoading,
    createCampaign,
    addContacts,
    startCampaign,
    pauseCampaign,
    dispositionContact,
    useCampaignContacts,
  };
};
