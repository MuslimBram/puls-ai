import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const {
      user_id,
      visitor_name,
      visitor_email,
      message,
      page_url,
      channel_id,
    } = body;

    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "user_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Keyword matching
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const textLower = message.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);

    const intentScore = matched.length > 0 ? 0.6 : 0.2;
    const priority = matched.length > 0 ? "medium" : "normal";

    const sourceName = page_url ? `Website (${new URL(page_url).pathname})` : "Website Chat";

    // Create inbox message
    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id,
      channel_id: channel_id || null,
      channel_type: "website_chat",
      source_name: sourceName,
      sender_name: visitor_name || "Website Visitor",
      sender_identifier: visitor_email || "",
      message_content: message,
      message_timestamp: new Date().toISOString(),
      intent_score: intentScore,
      matched_keywords: matched,
      is_unread: true,
      priority,
      status: "new",
      metadata: { page_url, visitor_email },
    });

    if (inboxErr) console.error("Inbox insert error:", inboxErr);

    // Create lead if matched
    let leadId = null;
    if (matched.length > 0) {
      const { data: lead } = await supabase
        .from("leads")
        .insert({
          user_id,
          message_content: message,
          source_name: sourceName,
          source_type: "website_chat",
          message_date: new Date().toISOString(),
          detected_keyword: matched[0],
          intent_score: intentScore,
          status: "new",
        })
        .select("id")
        .single();
      leadId = lead?.id;
    }

    return new Response(JSON.stringify({ ok: true, matched: matched.length, lead_id: leadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webchat-ingest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
