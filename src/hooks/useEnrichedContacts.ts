import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface EnrichedContact {
  id: string;
  contact_identifier: string;
  contact_name: string | null;
  channel_types: string[];
  total_messages: number;
  total_leads: number;
  total_deals: number;
  total_deal_value: number;
  avg_intent_score: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_channel: string | null;
  tags: string[];
  sentiment_summary: string | null;
  ai_profile_summary: string | null;
  is_opted_out: boolean;
  enriched_at: string;
}

export const useEnrichedContacts = (limit = 50) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["enriched-contacts", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enriched_contacts")
        .select("*")
        .eq("user_id", user!.id)
        .order("last_seen_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as EnrichedContact[];
    },
    enabled: !!user,
  });

  return { contacts: query.data ?? [], isLoading: query.isLoading };
};

export const useEnrichedContact = (contactIdentifier: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["enriched-contact", user?.id, contactIdentifier],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enriched_contacts")
        .select("*")
        .eq("user_id", user!.id)
        .eq("contact_identifier", contactIdentifier)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EnrichedContact | null;
    },
    enabled: !!user && !!contactIdentifier,
  });

  return { contact: query.data, isLoading: query.isLoading };
};
