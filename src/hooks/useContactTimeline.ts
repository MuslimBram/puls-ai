import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ContactTag {
  id: string;
  user_id: string;
  workspace_id: string | null;
  contact_identifier: string;
  contact_name: string | null;
  tag_type: string;
  tag_value: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  type: "message" | "lead" | "deal" | "call" | "broadcast" | "note";
  title: string;
  description: string;
  channel?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export const useContactTags = (contactIdentifier?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["contact-tags", user?.id, contactIdentifier],
    queryFn: async () => {
      let q = supabase
        .from("contact_tags")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (contactIdentifier) q = q.eq("contact_identifier", contactIdentifier);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ContactTag[];
    },
    enabled: !!user,
  });

  const addTag = useMutation({
    mutationFn: async (tag: { contact_identifier: string; contact_name?: string; tag_type: string; tag_value: string }) => {
      const { error } = await supabase.from("contact_tags").insert({
        ...tag,
        user_id: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-tags"] });
      toast.success("Tag added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-tags"] });
      toast.success("Tag removed");
    },
  });

  return { tags: query.data ?? [], isLoading: query.isLoading, addTag, removeTag };
};

export const useContactTimeline = (contactIdentifier: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["contact-timeline", user?.id, contactIdentifier],
    queryFn: async () => {
      if (!contactIdentifier) return [];

      const events: TimelineEvent[] = [];

      // Inbox messages
      const { data: messages } = await supabase
        .from("inbox_messages")
        .select("id, message_content, source_name, channel_type, created_at")
        .eq("user_id", user!.id)
        .eq("sender_identifier", contactIdentifier)
        .order("created_at", { ascending: false })
        .limit(20);

      messages?.forEach((m: any) => {
        events.push({
          id: m.id,
          type: "message",
          title: `Message via ${m.source_name}`,
          description: m.message_content?.substring(0, 120) || "",
          channel: m.channel_type,
          created_at: m.created_at,
        });
      });

      // Leads
      const { data: leads } = await supabase
        .from("leads")
        .select("id, source_name, message_content, detected_keyword, message_date")
        .eq("user_id", user!.id)
        .eq("author_username", contactIdentifier)
        .order("message_date", { ascending: false })
        .limit(20);

      leads?.forEach((l: any) => {
        events.push({
          id: l.id,
          type: "lead",
          title: `Lead from ${l.source_name}`,
          description: l.message_content?.substring(0, 120) || "",
          created_at: l.message_date,
          metadata: { keyword: l.detected_keyword },
        });
      });

      // Call records
      const { data: calls } = await supabase
        .from("call_records" as any)
        .select("id, call_direction, call_status, call_outcome, call_duration, created_at")
        .eq("user_id", user!.id)
        .or(`contact_phone.eq.${contactIdentifier},contact_email.eq.${contactIdentifier}`)
        .order("created_at", { ascending: false })
        .limit(20);

      calls?.forEach((c: any) => {
        events.push({
          id: c.id,
          type: "call",
          title: `${c.call_direction} call — ${c.call_outcome}`,
          description: `Duration: ${Math.floor((c.call_duration || 0) / 60)}m ${(c.call_duration || 0) % 60}s`,
          created_at: c.created_at,
        });
      });

      // Deals
      const { data: deals } = await supabase
        .from("deals")
        .select("id, title, deal_value, currency, created_at")
        .eq("user_id", user!.id)
        .or(`contact_email.eq.${contactIdentifier},contact_phone.eq.${contactIdentifier}`)
        .order("created_at", { ascending: false })
        .limit(10);

      deals?.forEach((d: any) => {
        events.push({
          id: d.id,
          type: "deal",
          title: d.title,
          description: `Value: ${d.currency} ${d.deal_value}`,
          created_at: d.created_at,
        });
      });

      return events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user && !!contactIdentifier,
  });
};
