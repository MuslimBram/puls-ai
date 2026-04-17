import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface SupportTicket {
  id: string;
  requester_user_id: string;
  requester_email: string | null;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_admin_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: any;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
  internal_note: boolean;
  created_at: string;
}

export const useMyTickets = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-support-tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .eq("requester_user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
    enabled: !!user,
  });
};

export const useAllTickets = () => {
  return useQuery({
    queryKey: ["all-support-tickets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
};

export const useTicketMessages = (ticketId: string | null) => {
  return useQuery({
    queryKey: ["support-ticket-messages", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      const { data, error } = await (supabase as any)
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportTicketMessage[];
    },
    enabled: !!ticketId,
  });
};

export const useSubmitTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      subject: string;
      description: string;
      category?: string;
      priority?: string;
      workspace_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("submit-ticket", {
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      qc.invalidateQueries({ queryKey: ["all-support-tickets"] });
      toast.success("Ticket submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useReplyTicket = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      ticket_id: string;
      body: string;
      sender_role?: "user" | "admin";
      internal_note?: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from("support_ticket_messages")
        .insert({
          ticket_id: input.ticket_id,
          sender_user_id: user!.id,
          sender_role: input.sender_role ?? "user",
          body: input.body,
          internal_note: input.internal_note ?? false,
        });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["support-ticket-messages", vars.ticket_id] });
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      qc.invalidateQueries({ queryKey: ["all-support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateTicketStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === "resolved" || input.status === "closed") {
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await (supabase as any)
        .from("support_tickets")
        .update(updates)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      qc.invalidateQueries({ queryKey: ["all-support-tickets"] });
      toast.success("Ticket updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
