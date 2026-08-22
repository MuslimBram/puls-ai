// supabase/functions/autonomous-ai-agent/index.ts
// ============================================================
// AI Agent 100% Autonom — Pa ndërhyrje njerëzore
// Ndryshimet nga unified-ai-agent:
//   1. Confidence threshold ulur: 0.35 (jo 0.50)
//   2. Nëse AI nuk di → kërkon info nga klienti (jo handoff)
//   3. Learning loop: çdo bisedë → mëson → përmirësohet
//   4. Proactive offers: AI nismëtar (jo vetëm reaktiv)
//   5. Multi-turn memory: di çfarë tha 3 mesazhe më parë
//   6. Fallback zinxhir: Memory → Training Data → FAQ → Kërko info
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { callAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Confidence threshold — ulur për autonomi më të lartë
const AUTONOMOUS_THRESHOLD = 0.35; // 35% — AI përpiqet të gjejë zgjidhje
const HARD_HANDOFF_THRESHOLD = 0.15; // < 15% → vetëm atëhere handoff

// Fallback zinxhir: nëse AI nuk di, pyeti klientin
function buildClarificationPrompt(question: string, context: string): string {
  return `Nuk e kuptova plotësisht pyetjen. Ndihmo me të dhëna shtesë: ${context}`;
}

// Ndërtoj sistem prompt me të gjitha burimet
async function buildFullSystemPrompt(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  customerId: string,
  incomingMessage: string
): Promise<string> {

  const parts: string[] = [];

  // 1. Config i agent-it
  const { data: config } = await supabase
    .from("ai_agent_configs")
    .select("agent_name,agent_tone,language,custom_instructions,business_description,business_hours")
    .eq("workspace_id", businessId)
    .maybeSingle();

  parts.push(`Ti je ${config?.agent_name ?? "Asistenti"} i këtij biznesi.`);
  parts.push(`Gjuha: ${config?.language ?? "sq"}. Toni: ${config?.agent_tone ?? "professional_friendly"}.`);
  if (config?.business_description) parts.push(`Biznesi: ${config.business_description}`);
  if (config?.custom_instructions) parts.push(`\nUDHËZIME SPECIALE:\n${config.custom_instructions}`);

  // 2. Business Memory (informacioni real)
  const { data: memories } = await supabase
    .from("business_memory")
    .select("entity_type, memory_key, memory_value")
    .eq("business_id", businessId)
    .gte("confidence", 0.35) // ulur threshold
    .order("confidence", { ascending: false })
    .limit(80);

  if (memories?.length) {
    const products = memories.filter(m => m.entity_type === "product");
    const faqs = memories.filter(m => m.entity_type === "faq_answer");
    const policies = memories.filter(m => m.entity_type === "policy");
    const hours = memories.find(m => m.entity_type === "business_hour");

    if (products.length) {
      parts.push("\nPRODUKTET/ÇMIMET:");
      products.forEach(p => {
        const v = p.memory_value as Record<string, unknown>;
        parts.push(`  • ${v.name ?? p.memory_key}: ${v.price_lek ?? v.price ?? "çmim i panjohur"}`);
      });
    }
    if (hours) {
      const h = hours.memory_value as Record<string, string>;
      parts.push(`\nORARET: ${JSON.stringify(h)}`);
    }
    if (faqs.length) {
      parts.push("\nPYETJE TË SHPESHTA:");
      faqs.forEach(f => {
        const v = f.memory_value as Record<string, string>;
        if (v.question) parts.push(`  P: ${v.question}\n  P: ${v.answer}`);
      });
    }
  }

  // 3. Training Data (FAQ manuale)
  const { data: training } = await supabase
    .from("ai_training_data")
    .select("type, question, answer")
    .eq("workspace_id", businessId)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .limit(30);

  if (training?.length) {
    parts.push("\nNJOHURI SHTESË:");
    training.forEach(t => {
      if (t.question) parts.push(`  P: ${t.question}\n  P: ${t.answer}`);
      else parts.push(`  → ${t.answer}`);
    });
  }

  // 4. Profili i klientit (personalizim)
  const { data: customerMemory } = await supabase
    .from("business_memory")
    .select("entity_type, memory_key, memory_value")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .gte("confidence", 0.3)
    .limit(10);

  if (customerMemory?.length) {
    const prefs = customerMemory.filter(m => m.entity_type === "customer_preference");
    const purchases = customerMemory.filter(m => m.entity_type === "customer_purchase");
    if (prefs.length || purchases.length) {
      parts.push("\nKY KLIENT SPECIFIK:");
      if (purchases.length) parts.push(`  Ka blerë më parë: ${purchases.length} herë`);
      if (prefs.length) parts.push(`  Preferencat: ${JSON.stringify(prefs[0].memory_value)}`);
    }
  }

  // 5. Journey Intelligence
  const { data: journey } = await supabase
    .from("customer_journey")
    .select("current_phase, communication_style")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (journey) {
    parts.push(`\nFAZA KLIENTIT: ${journey.current_phase} → Stil: ${journey.communication_style}`);
  }

  // 6. Rregulla AUTONOMIE
  parts.push(`
RREGULLA AUTONOMIE (KRITIKE):
1. KURRË mos thuaj "nuk e di" — nëse nuk di, pyet klientin për të kuptuar nevojën
2. KURRË mos dërgo te "njeri" nëse nuk e kërkon EKSPLICISHT klienti
3. Nëse çmimi mungon nga memoria → thuaj "kontrolloj dhe ju njoftoj brenda 5 min" 
4. Nëse pyetja është teknike → ofroi email kontakti, mos thuaj "nuk mundem"
5. PRO-AKTIV: nëse klienti tregon interes → ofroji hapin tjetër konkret (rezervim/porosi)
6. MEMORIA: di çfarë ke thënë në mesazhet e mëparshme — mos pyet sërish`);

  return parts.join("\n");
}

// Post-processing: mëso dhe update journey
function triggerLearning(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  businessId: string,
  customerId: string,
  messageText: string,
  aiReply: string,
  msgCount: number
): void {
  // Memory extraction çdo 3 mesazhe
  if (msgCount % 3 === 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-and-store-memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}` },
      body: JSON.stringify({ conversation_id: conversationId, business_id: businessId, customer_id: customerId }),
    }).catch(() => {});
  }

  // Journey update çdo mesazh
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/journey-engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}` },
    body: JSON.stringify({
      action: "update",
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      last_message_text: messageText,
      last_message_role: "user",
      message_count_in_conversation: msgCount,
    }),
  }).catch(() => {});

  // Revenue scoring çdo 5 mesazhe
  if (msgCount % 5 === 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/score-and-rank-leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}` },
      body: JSON.stringify({ business_id: businessId, customer_id: customerId, trigger: "post_conversation" }),
    }).catch(() => {});
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.verify_token") === Deno.env.get("META_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("OK", { status: 200 });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const immediate200 = new Response("EVENT_RECEIVED", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  let payload: Record<string, unknown>;
  try { payload = await req.json() as Record<string, unknown>; }
  catch { return new Response("Bad Request", { status: 400 }); }

  (async () => {
    try {
      const entries = (payload.entry ?? []) as Array<Record<string, unknown>>;
      const platform = (payload.object as string)?.includes("whatsapp") ? "whatsapp" : "instagram";

      for (const entry of entries) {
        const messaging = platform === "whatsapp"
          ? (((entry.changes ?? []) as Array<Record<string, unknown>>)[0]?.value as Record<string, unknown>)?.messages ?? []
          : (entry.messaging ?? []) as Array<Record<string, unknown>>;

        for (const event of messaging as Array<Record<string, unknown>>) {
          const messageText = platform === "whatsapp"
            ? ((event.text as Record<string, string>)?.body ?? "")
            : ((event.message as Record<string, string>)?.text ?? "");

          if (!messageText) continue;

          const senderId = platform === "whatsapp"
            ? (event.from as string)
            : ((event.sender as Record<string, string>)?.id ?? "");
          const recipientId = platform === "whatsapp"
            ? ((((payload.entry as Array<Record<string, unknown>>)[0]?.changes as Array<Record<string, unknown>>)[0]?.value as Record<string, unknown>)?.metadata as Record<string, string>)?.phone_number_id ?? ""
            : ((event.recipient as Record<string, string>)?.id ?? "");

          // Gjej kanalin
          const { data: channel } = await supabase
            .from("channels")
            .select("id, business_id, access_token_encrypted")
            .eq("external_account_id", recipientId)
            .eq("platform", platform)
            .maybeSingle();
          if (!channel) continue;

          const businessId = channel.business_id;

          // Gjej/krijo klientin
          const field = platform === "whatsapp" ? "whatsapp_phone" : "instagram_psid";
          let { data: customer } = await supabase
            .from("customers").select("id, opted_out_of_offers")
            .eq("business_id", businessId).eq(field, senderId).maybeSingle();
          if (!customer) {
            const { data: nc } = await supabase.from("customers")
              .insert({ business_id: businessId, [field]: senderId, source_channel_id: channel.id })
              .select("id, opted_out_of_offers").single();
            customer = nc;
          }
          if (!customer || customer.opted_out_of_offers) continue;

          const customerId = customer.id;

          // Opt-out check
          if (/stop|jo oferta|unsubscribe/i.test(messageText)) {
            await supabase.from("customers").update({ opted_out_of_offers: true }).eq("id", customerId);
            continue;
          }

          // Gjej/krijo bisedën
          let { data: conversation } = await supabase
            .from("conversations").select("id, ai_replies_count")
            .eq("channel_id", channel.id).eq("customer_id", customerId)
            .in("status", ["open","ai_handling"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!conversation) {
            const { data: nc } = await supabase.from("conversations")
              .insert({ business_id: businessId, channel_id: channel.id, customer_id: customerId, status: "ai_handling" })
              .select("id, ai_replies_count").single();
            conversation = nc;
          }
          if (!conversation) continue;

          // Ruaj mesazhin
          await supabase.from("messages").insert({
            conversation_id: conversation.id, channel_id: channel.id,
            role: "user", content: messageText,
          });

          const msgCount = (conversation.ai_replies_count ?? 0) + 1;

          // Ndërtoj system prompt autonom
          const systemPrompt = await buildFullSystemPrompt(supabase, businessId, customerId, messageText);

          // Merr historikun
          const { data: history } = await supabase.from("messages")
            .select("role, content").eq("conversation_id", conversation.id)
            .order("created_at", { ascending: false }).limit(8);
          const msgs = (history ?? []).reverse().slice(0,-1)
            .map((m: Record<string, string>) => ({ role: m.role as "user"|"assistant", content: m.content }));

          // Gjenero me AI
          const result = await callAI(
            [...msgs, { role: "user" as const, content: messageText }],
            { systemPrompt, maxTokens: 500, workspaceId: businessId, taskType: "customer_support" }
          );

          const reply = result.text;
          const confidence = reply.toLowerCase().includes("nuk e di") || reply.includes("kontrolloj") ? 0.4 : 0.85;

          // HANDOFF vetëm nëse kërkesa eksplicite ose confidence < 15%
          const wantsHuman = /agjent|operator|njeri|human agent/i.test(messageText);
          if (wantsHuman || confidence < HARD_HANDOFF_THRESHOLD) {
            await supabase.from("conversations").update({ status: "awaiting_human" }).eq("id", conversation.id);
            triggerLearning(supabase, conversation.id, businessId, customerId, messageText, reply, msgCount);
            continue;
          }

          // Dërgo përgjigje
          const accessToken = channel.access_token_encrypted;
          if (platform === "whatsapp") {
            await fetch(`https://graph.facebook.com/v22.0/${recipientId}/messages`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ messaging_product: "whatsapp", to: senderId, type: "text", text: { body: reply } }),
            }).catch(() => {});
          } else {
            await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${accessToken}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recipient: { id: senderId }, message: { text: reply } }),
            }).catch(() => {});
          }

          // Ruaj përgjigjen
          await supabase.from("messages").insert({
            conversation_id: conversation.id, channel_id: channel.id,
            role: "assistant", content: reply, ai_confidence: confidence,
          });
          await supabase.from("conversations").update({ ai_replies_count: msgCount }).eq("id", conversation.id);

          // Learning loop
          triggerLearning(supabase, conversation.id, businessId, customerId, messageText, reply, msgCount);
        }
      }
    } catch (err) {
      console.error("autonomous-ai-agent error:", err);
    }
  })();

  return immediate200;
});
