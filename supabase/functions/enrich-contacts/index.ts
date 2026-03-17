import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id;

    // Get users to enrich (either specific or all paid)
    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("user_id")
        .neq("plan", "standard")
        .limit(100);
      userIds = (subs || []).map((s: any) => s.user_id);
    }

    let enriched = 0;
    const now = new Date();

    for (const userId of userIds) {
      // Get workspace
      const { data: wsMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const workspaceId = wsMember?.workspace_id;

      // Get all unique contacts from inbox
      const { data: inboxContacts } = await supabase
        .from("inbox_messages")
        .select("sender_identifier, sender_name, channel_type, intent_score, message_timestamp")
        .eq("user_id", userId)
        .order("message_timestamp", { ascending: false })
        .limit(1000);

      // Group by contact identifier
      const contactMap = new Map<string, any>();
      for (const msg of inboxContacts || []) {
        if (!msg.sender_identifier) continue;
        const key = msg.sender_identifier;
        if (!contactMap.has(key)) {
          contactMap.set(key, {
            contact_identifier: key,
            contact_name: msg.sender_name,
            channel_types: new Set<string>(),
            total_messages: 0,
            intent_scores: [],
            first_seen_at: msg.message_timestamp,
            last_seen_at: msg.message_timestamp,
            last_channel: msg.channel_type,
          });
        }
        const c = contactMap.get(key)!;
        c.total_messages++;
        if (msg.channel_type) c.channel_types.add(msg.channel_type);
        if (msg.intent_score) c.intent_scores.push(msg.intent_score);
        if (msg.message_timestamp < c.first_seen_at) c.first_seen_at = msg.message_timestamp;
        if (msg.message_timestamp > c.last_seen_at) {
          c.last_seen_at = msg.message_timestamp;
          c.last_channel = msg.channel_type;
          if (msg.sender_name) c.contact_name = msg.sender_name;
        }
      }

      // Enrich with leads data
      const { data: leads } = await supabase
        .from("leads")
        .select("source_name, intent_score, status")
        .eq("user_id", userId)
        .limit(1000);

      const leadsByContact = new Map<string, number>();
      for (const lead of leads || []) {
        const key = lead.source_name;
        if (!key) continue;
        leadsByContact.set(key, (leadsByContact.get(key) || 0) + 1);
      }

      // Enrich with deals data
      const { data: deals } = await supabase
        .from("deals")
        .select("contact_email, deal_value, stage")
        .eq("user_id", userId)
        .limit(500);

      const dealsByContact = new Map<string, { count: number; value: number }>();
      for (const deal of deals || []) {
        const key = deal.contact_email;
        if (!key) continue;
        const existing = dealsByContact.get(key) || { count: 0, value: 0 };
        existing.count++;
        existing.value += Number(deal.deal_value || 0);
        dealsByContact.set(key, existing);
      }

      // Enrich with opt-out data
      const { data: optouts } = await supabase
        .from("broadcast_optouts")
        .select("contact_identifier")
        .eq("user_id", userId);

      const optedOutSet = new Set((optouts || []).map((o: any) => o.contact_identifier));

      // Enrich with AI memory
      const { data: memories } = await supabase
        .from("ai_conversation_memory")
        .select("contact_identifier, summary, sentiment_trend")
        .eq("workspace_id", workspaceId)
        .limit(500);

      const memoryByContact = new Map<string, any>();
      for (const m of memories || []) {
        memoryByContact.set(m.contact_identifier, m);
      }

      // Enrich with tags
      const { data: tags } = await supabase
        .from("contact_tags")
        .select("contact_identifier, tag_value")
        .eq("user_id", userId)
        .limit(1000);

      const tagsByContact = new Map<string, string[]>();
      for (const t of tags || []) {
        const existing = tagsByContact.get(t.contact_identifier) || [];
        existing.push(t.tag_value);
        tagsByContact.set(t.contact_identifier, existing);
      }

      // Upsert enriched profiles
      for (const [identifier, data] of contactMap) {
        const dealData = dealsByContact.get(identifier);
        const memory = memoryByContact.get(identifier);
        const avgIntent = data.intent_scores.length > 0
          ? data.intent_scores.reduce((a: number, b: number) => a + b, 0) / data.intent_scores.length
          : 0;

        const enrichedData = {
          user_id: userId,
          workspace_id: workspaceId,
          contact_identifier: identifier,
          contact_name: data.contact_name,
          channel_types: Array.from(data.channel_types),
          total_messages: data.total_messages,
          total_leads: leadsByContact.get(identifier) || 0,
          total_deals: dealData?.count || 0,
          total_deal_value: dealData?.value || 0,
          avg_intent_score: Math.round(avgIntent * 100) / 100,
          first_seen_at: data.first_seen_at,
          last_seen_at: data.last_seen_at,
          last_channel: data.last_channel,
          tags: tagsByContact.get(identifier) || [],
          sentiment_summary: memory?.sentiment_trend || null,
          ai_profile_summary: memory?.summary || null,
          is_opted_out: optedOutSet.has(identifier),
          enriched_at: now.toISOString(),
          updated_at: now.toISOString(),
        };

        const { data: existing } = await supabase
          .from("enriched_contacts")
          .select("id")
          .eq("user_id", userId)
          .eq("contact_identifier", identifier)
          .maybeSingle();

        if (existing) {
          await supabase.from("enriched_contacts").update(enrichedData).eq("id", existing.id);
        } else {
          await supabase.from("enriched_contacts").insert(enrichedData);
        }
        enriched++;
      }
    }

    return new Response(JSON.stringify({ ok: true, enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ENRICH-CONTACTS] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
