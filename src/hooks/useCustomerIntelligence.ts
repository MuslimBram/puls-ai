import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CustomerIntelligenceProfileData {
  displayName: string;
  identifier: string;
  firstSeen: string | null;
  lastSeen: string | null;
  totalInteractions: number;
  totalMessages: number;
  totalLeads: number;
  totalCalls: number;
  totalDeals: number;
  openDeals: number;
  totalDealValue: number;
  predictedValue: number;
  avgIntentScore: number;
  avgAiScore: number;
  churnRisk: number;
  engagementStatus: "active" | "warming" | "cold";
  cadenceLabel: string;
  preferredChannel: string | null;
  sentimentTrend: string | null;
  summary: string;
  topKeywords: string[];
  tags: string[];
  nextBestActions: string[];
}

const uniqueById = <T extends { id: string }>(rows: T[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const pickLatest = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

const pickEarliest = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0] ?? null;

export const useCustomerIntelligence = (contactIdentifier?: string | null, contactName?: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["customer-intelligence", user?.id, contactIdentifier, contactName],
    queryFn: async () => {
      if (!user || !contactIdentifier) return null;

      const [
        inboxByIdentifier,
        inboxByName,
        leadsByIdentifier,
        callsByPhone,
        callsByEmail,
        callsByName,
        dealsByPhone,
        dealsByEmail,
        dealsByName,
        tagsQuery,
        memoryByIdentifier,
        memoryByName,
      ] = await Promise.all([
        supabase
          .from("inbox_messages")
          .select("id, sender_name, sender_identifier, channel_type, source_name, message_timestamp, message_content")
          .eq("user_id", user.id)
          .eq("sender_identifier", contactIdentifier)
          .order("message_timestamp", { ascending: false })
          .limit(50),
        contactName
          ? supabase
              .from("inbox_messages")
              .select("id, sender_name, sender_identifier, channel_type, source_name, message_timestamp, message_content")
              .eq("user_id", user.id)
              .eq("sender_name", contactName)
              .order("message_timestamp", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null } as any),
        (supabase
          .from("leads")
          .select("id, source_name, source_type, message_content, detected_keyword, message_date, intent_score, status, author_username")
          .eq("user_id", user.id)
          .eq("author_username", contactIdentifier)
          .order("message_date", { ascending: false })
          .limit(50)) as any,
        supabase
          .from("call_records" as any)
          .select("id, contact_name, contact_phone, contact_email, call_direction, call_outcome, call_duration, created_at")
          .eq("user_id", user.id)
          .eq("contact_phone", contactIdentifier)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("call_records" as any)
          .select("id, contact_name, contact_phone, contact_email, call_direction, call_outcome, call_duration, created_at")
          .eq("user_id", user.id)
          .eq("contact_email", contactIdentifier)
          .order("created_at", { ascending: false })
          .limit(20),
        contactName
          ? supabase
              .from("call_records" as any)
              .select("id, contact_name, contact_phone, contact_email, call_direction, call_outcome, call_duration, created_at")
              .eq("user_id", user.id)
              .eq("contact_name", contactName)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("deals")
          .select("id, title, contact_name, contact_phone, contact_email, source_channel, deal_value, currency, created_at, won_at, lost_at")
          .eq("user_id", user.id)
          .eq("contact_phone", contactIdentifier)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("deals")
          .select("id, title, contact_name, contact_phone, contact_email, source_channel, deal_value, currency, created_at, won_at, lost_at")
          .eq("user_id", user.id)
          .eq("contact_email", contactIdentifier)
          .order("created_at", { ascending: false })
          .limit(20),
        contactName
          ? supabase
              .from("deals")
              .select("id, title, contact_name, contact_phone, contact_email, source_channel, deal_value, currency, created_at, won_at, lost_at")
              .eq("user_id", user.id)
              .eq("contact_name", contactName)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("contact_tags")
          .select("id, contact_name, tag_value")
          .eq("user_id", user.id)
          .eq("contact_identifier", contactIdentifier)
          .order("created_at", { ascending: false }),
        supabase
          .from("ai_conversation_memory")
          .select("summary, sentiment_trend, interaction_count, key_facts, contact_name, updated_at")
          .eq("contact_identifier", contactIdentifier)
          .maybeSingle(),
        contactName
          ? supabase
              .from("ai_conversation_memory")
              .select("summary, sentiment_trend, interaction_count, key_facts, contact_name, updated_at")
              .eq("contact_name", contactName)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const messages = uniqueById([...(inboxByIdentifier.data ?? []), ...(inboxByName.data ?? [])] as any[]);
      const leads = uniqueById((leadsByIdentifier.data ?? []) as any[]);
      const calls = uniqueById([
        ...((callsByPhone.data ?? []) as any[]),
        ...((callsByEmail.data ?? []) as any[]),
        ...((callsByName.data ?? []) as any[]),
      ]);
      const deals = uniqueById([
        ...((dealsByPhone.data ?? []) as any[]),
        ...((dealsByEmail.data ?? []) as any[]),
        ...((dealsByName.data ?? []) as any[]),
      ] as any[]);
      const tags = (tagsQuery.data ?? []) as any[];
      const memory = memoryByIdentifier.data ?? memoryByName.data;

      const leadIds = leads.map((lead) => lead.id).filter(Boolean);
      const leadScoresQuery = leadIds.length
        ? await supabase
            .from("lead_scores")
            .select("lead_id, score, churn_risk, predicted_value")
            .in("lead_id", leadIds)
        : { data: [] as any[], error: null };
      const leadScores = (leadScoresQuery.data ?? []) as any[];

      const dates = [
        ...messages.map((row) => row.message_timestamp),
        ...leads.map((row) => row.message_date),
        ...calls.map((row) => row.created_at),
        ...deals.map((row) => row.created_at),
        memory?.updated_at,
      ].filter(Boolean) as string[];

      const channelCounts = new Map<string, number>();
      messages.forEach((row: any) => {
        const key = row.channel_type || row.source_name || "message";
        channelCounts.set(key, (channelCounts.get(key) ?? 0) + 1);
      });
      leads.forEach((row: any) => {
        const key = row.source_type || row.source_name || "lead";
        channelCounts.set(key, (channelCounts.get(key) ?? 0) + 1);
      });
      deals.forEach((row: any) => {
        if (!row.source_channel) return;
        channelCounts.set(row.source_channel, (channelCounts.get(row.source_channel) ?? 0) + 1);
      });

      const preferredChannel = Array.from(channelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const totalDealValue = deals.reduce((sum: number, row: any) => sum + (row.deal_value || 0), 0);
      const predictedValue = leadScores.reduce((sum: number, row: any) => sum + (row.predicted_value || 0), 0);
      const avgIntentScore = average(leads.map((row: any) => Math.round(Number(row.intent_score || 0) * 100)).filter((value) => value > 0));
      const avgAiScore = average(leadScores.map((row: any) => Number(row.score || 0)).filter((value) => value > 0));
      const churnRisk = average(leadScores.map((row: any) => Number(row.churn_risk || 0)).filter((value) => value > 0));
      const openDeals = deals.filter((row: any) => !row.won_at && !row.lost_at).length;
      const lastSeen = dates.length > 0 ? pickLatest(...dates) : null;
      const firstSeen = dates.length > 0 ? pickEarliest(...dates) : null;
      const daysSinceLastSeen = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000) : null;

      let engagementStatus: CustomerIntelligenceProfileData["engagementStatus"] = "cold";
      if (daysSinceLastSeen !== null && daysSinceLastSeen <= 7) engagementStatus = "active";
      else if (daysSinceLastSeen !== null && daysSinceLastSeen <= 30) engagementStatus = "warming";

      const totalInteractions = messages.length + leads.length + calls.length + deals.length;
      const cadenceLabel =
        totalInteractions >= 12 ? "high frequency" : totalInteractions >= 5 ? "steady engagement" : totalInteractions > 0 ? "sporadic contact" : "new contact";

      const keywordCounts = new Map<string, number>();
      leads.forEach((row: any) => {
        if (!row.detected_keyword) return;
        keywordCounts.set(row.detected_keyword, (keywordCounts.get(row.detected_keyword) ?? 0) + 1);
      });
      const topKeywords = Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([value]) => value);

      const nextBestActions = [
        openDeals > 0 ? `Follow up on ${openDeals} active deal${openDeals === 1 ? "" : "s"}.` : null,
        avgAiScore >= 75 ? "Prioritize this contact for direct outreach while intent is high." : null,
        daysSinceLastSeen !== null && daysSinceLastSeen > 14 ? "Send a re-engagement check-in to restart momentum." : null,
        tags.length === 0 ? "Add segmentation tags to improve targeting and reporting." : null,
        messages.length > 0 && calls.length === 0 ? "Consider a call or voice touchpoint after recent messages." : null,
      ].filter(Boolean) as string[];

      const displayName =
        contactName ||
        memory?.contact_name ||
        messages.find((row: any) => row.sender_name)?.sender_name ||
        tags.find((row: any) => row.contact_name)?.contact_name ||
        calls.find((row: any) => row.contact_name)?.contact_name ||
        deals.find((row: any) => row.contact_name)?.contact_name ||
        contactIdentifier;

      const summary =
        memory?.summary ||
        `${displayName} shows ${cadenceLabel} with ${messages.length} messages, ${leads.length} lead${leads.length === 1 ? "" : "s"}, and ${deals.length} deal${deals.length === 1 ? "" : "s"} recorded so far.`;

      return {
        displayName,
        identifier: contactIdentifier,
        firstSeen,
        lastSeen,
        totalInteractions,
        totalMessages: messages.length,
        totalLeads: leads.length,
        totalCalls: calls.length,
        totalDeals: deals.length,
        openDeals,
        totalDealValue,
        predictedValue,
        avgIntentScore,
        avgAiScore,
        churnRisk,
        engagementStatus,
        cadenceLabel,
        preferredChannel,
        sentimentTrend: memory?.sentiment_trend ?? null,
        summary,
        topKeywords,
        tags: tags.map((row) => row.tag_value).filter(Boolean),
        nextBestActions,
      } satisfies CustomerIntelligenceProfileData;
    },
    enabled: !!user && !!contactIdentifier,
  });
};
