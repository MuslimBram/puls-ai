// unified-ai-agent/index.ts
// ============================================================
// Agjenti i unifikuar i Pulse AI 2.0
//
// Zinxhiri i plotë para çdo përgjigje:
//   1. recall-business-context  → system prompt me memorie
//   2. journey-engine (enrich)  → + udhëzime toni sipas fazës
//   3. Claude API               → gjeneron përgjigjen
//   4. Dërgon te klienti        → me retry
//
// Pas çdo përgjigje (fire-and-forget):
//   5. extract-and-store-memory → mëso nga kjo bisedë
//   6. journey-engine (update)  → përditëso fazën
//   7. score-and-rank-leads     → reskor revenue profile
//
// Mbështet: Instagram + WhatsApp (kanal-agnostik)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----------------------------------------------------------------
// Tipet
// ----------------------------------------------------------------
interface ChannelMessage {
  sender_id: string;       // ID i jashtëm i dërguesit (IG PSID, WA phone, etc.)
  recipient_id: string;    // ID e kanalit tonë (IG account ID, WA phone number ID)
  message_text: string;
  message_id: string;      // ID e jashtëm e mesazhit (për de-dup)
  platform: "instagram" | "whatsapp" | "facebook" | "telegram";
  timestamp_ms: number;
}

interface ChannelRecord {
  id: string;
  business_id: string;
  platform: string;
  access_token_encrypted: string;
  external_account_id: string;
  settings: Record<string, unknown>;
}

interface CustomerRecord {
  id: string;
  name: string | null;
  display_name: string | null;
  opted_out_of_offers: boolean;
}

interface ConversationRecord {
  id: string;
  status: string;
  ai_replies_count: number | null;
}

interface BusinessRecord {
  trial_status: string;
  ai_replies_used_this_period: number;
}

// ----------------------------------------------------------------
// Konstantet
// ----------------------------------------------------------------
const HANDOFF_KEYWORDS = [
  "agjent", "njeri", "operator", "staf", "person", "ndihmë njerëzore",
  "human", "agent", "staff", "real person", "speak to someone"
];

const OPT_OUT_KEYWORDS = [
  "jo oferta", "mos dërgo", "çregjistro", "stop oferta", "unsubscribe",
  "no offers", "stop", "opt out", "remove me"
];

const MAX_AI_RETRIES = 3;
const AI_CONFIDENCE_THRESHOLD = 0.50;
const MAX_MESSAGES_HISTORY = 12;
const SCORING_INTERVAL = 5; // reskor çdo 5 mesazhe

// ----------------------------------------------------------------
// Thirrjet e brendshme (Internal Function Calls)
// ----------------------------------------------------------------
const SUPABASE_FUNCTIONS_URL = () =>
  `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

const SERVICE_AUTH = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
});

async function callInternal(
  functionName: string,
  payload: Record<string, unknown>,
  critical = false
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${SUPABASE_FUNCTIONS_URL()}/${functionName}`,
      {
        method: "POST",
        headers: SERVICE_AUTH(),
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      if (critical) throw new Error(`${functionName} dështoi: ${err}`);
      console.warn(`${functionName} dështoi (jo kritike): ${err}`);
      return null;
    }
    return await res.json() as Record<string, unknown>;
  } catch (err) {
    if (critical) throw err;
    console.warn(`${functionName} error (jo kritike):`, err);
    return null;
  }
}

// ----------------------------------------------------------------
// Ndërtimi i system prompt të pasuruar (3 shtresa)
// ----------------------------------------------------------------
async function buildEnrichedSystemPrompt(
  businessId: string,
  customerId: string,
  incomingMessage: string
): Promise<{ prompt: string; phase: string; hasMemory: boolean }> {

  // Shtresa 1: Memoria e biznesit
  const memoryResult = await callInternal("recall-business-context", {
    business_id: businessId,
    customer_id: customerId,
    incoming_message: incomingMessage,
    min_confidence: 0.4,
  });

  const basePrompt = (memoryResult?.system_prompt as string) ??
    "Ti je asistenti AI i këtij biznesi. Komunikoni me ton profesional por miqësor, në shqip. Nëse nuk di diçka me siguri, thuaj 'do të kontrolloj dhe të njoftoj'.";
  const hasMemory = (memoryResult?.has_memory as boolean) ?? false;

  // Shtresa 2: Journey Intelligence (enrich mbi base prompt)
  const journeyResult = await callInternal("journey-engine", {
    action: "enrich",
    business_id: businessId,
    customer_id: customerId,
    base_system_prompt: basePrompt,
    incoming_message: incomingMessage,
  });

  const enrichedPrompt = (journeyResult?.enriched_system_prompt as string) ?? basePrompt;
  const currentPhase = (journeyResult?.current_phase as string) ?? "first_touch";

  return { prompt: enrichedPrompt, phase: currentPhase, hasMemory };
}

// ----------------------------------------------------------------
// Gjenerimi i përgjigjes me Claude
// ----------------------------------------------------------------
async function generateReply(
  systemPrompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  newMessage: string
): Promise<{ reply: string; confidence: number }> {

  const UNCERTAINTY_SIGNALS = [
    "nuk jam i sigurt", "nuk e di", "ndoshta", "do kontrolloj",
    "not sure", "i'm not certain", "might be", "possibly", "perhaps"
  ];

  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          system: systemPrompt,
          messages: [
            ...history.slice(-MAX_MESSAGES_HISTORY),
            { role: "user", content: newMessage },
          ],
        }),
      });

      if (!res.ok) {
        if (attempt === MAX_AI_RETRIES) throw new Error(`Claude API: ${res.status}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      const data = await res.json() as { content?: Array<{ text?: string }> };
      const reply = data.content?.[0]?.text ?? "";

      if (!reply) throw new Error("Claude API ktheu përgjigje bosh");

      const lowerReply = reply.toLowerCase();
      const hasUncertainty = UNCERTAINTY_SIGNALS.some(s => lowerReply.includes(s));
      const confidence = hasUncertainty ? 0.42 : 0.88;

      return { reply, confidence };

    } catch (err) {
      if (attempt === MAX_AI_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Claude API dështoi pas të gjitha përpjekjeve");
}

// ----------------------------------------------------------------
// Dërgimi te kanali (kanal-agnostik)
// ----------------------------------------------------------------
async function sendToChannel(
  platform: string,
  recipientExternalId: string,
  text: string,
  accessToken: string
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      let url: string;
      let body: Record<string, unknown>;

      if (platform === "instagram" || platform === "facebook") {
        url = `https://graph.facebook.com/v22.0/me/messages?access_token=${accessToken}`;
        body = {
          recipient: { id: recipientExternalId },
          message: { text },
        };
      } else if (platform === "whatsapp") {
        // WhatsApp Business API (Cloud API)
        const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
        url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
        body = {
          messaging_product: "whatsapp",
          to: recipientExternalId,
          type: "text",
          text: { body: text },
        };
      } else {
        throw new Error(`Platform i panjohur: ${platform}`);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (platform === "whatsapp") {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) return;

      const errText = await res.text();
      if (attempt === MAX_AI_RETRIES) {
        throw new Error(`Send API dështoi pas ${MAX_AI_RETRIES} përpjekjeve: ${errText}`);
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));

    } catch (err) {
      if (attempt === MAX_AI_RETRIES) throw err;
    }
  }
}

// ----------------------------------------------------------------
// Post-processing (fire-and-forget — nuk pret rezultatin)
// ----------------------------------------------------------------
function triggerPostProcessing(
  conversationId: string,
  businessId: string,
  customerId: string,
  messageText: string,
  messageRole: "user" | "assistant",
  hasPurchase: boolean,
  hasComplaint: boolean,
  messageCountInConversation: number,
  daysSinceLastMessage: number
): void {
  // 1. Nxjerrja e memories (çdo 5 mesazhe)
  if (messageCountInConversation % SCORING_INTERVAL === 0) {
    fetch(`${SUPABASE_FUNCTIONS_URL()}/extract-and-store-memory`, {
      method: "POST",
      headers: SERVICE_AUTH(),
      body: JSON.stringify({
        conversation_id: conversationId,
        business_id: businessId,
        customer_id: customerId,
      }),
    }).catch(e => console.warn("Memory extraction silent fail:", e));
  }

  // 2. Përditësimi i journey-t (pas çdo mesazhi)
  fetch(`${SUPABASE_FUNCTIONS_URL()}/journey-engine`, {
    method: "POST",
    headers: SERVICE_AUTH(),
    body: JSON.stringify({
      action: "update",
      business_id: businessId,
      customer_id: customerId,
      conversation_id: conversationId,
      last_message_text: messageText,
      last_message_role: messageRole,
      has_purchase: hasPurchase,
      has_complaint: hasComplaint,
      message_count_in_conversation: messageCountInConversation,
      days_since_last_message: daysSinceLastMessage,
    }),
  }).catch(e => console.warn("Journey update silent fail:", e));

  // 3. Revenue scoring (çdo 5 mesazhe)
  if (messageCountInConversation % SCORING_INTERVAL === 0) {
    fetch(`${SUPABASE_FUNCTIONS_URL()}/score-and-rank-leads`, {
      method: "POST",
      headers: SERVICE_AUTH(),
      body: JSON.stringify({
        business_id: businessId,
        customer_id: customerId,
        trigger: "post_conversation",
      }),
    }).catch(e => console.warn("Lead scoring silent fail:", e));
  }
}

// ----------------------------------------------------------------
// Procesimi i një mesazhi
// ----------------------------------------------------------------
async function processMessage(
  supabase: ReturnType<typeof createClient>,
  msg: ChannelMessage
): Promise<void> {

  // ── 1. Gjej kanalin ─────────────────────────────────────────
  const { data: channel, error: channelErr } = await supabase
    .from("channels")
    .select("id, business_id, access_token_encrypted, settings, platform")
    .eq("external_account_id", msg.recipient_id)
    .eq("platform", msg.platform)
    .maybeSingle();

  if (channelErr || !channel) {
    console.warn(`Kanali nuk u gjet: ${msg.platform}/${msg.recipient_id}`);
    return;
  }

  const { business_id: businessId, id: channelId } = channel as ChannelRecord;

  // ── 2. De-duplikimi (siguro që nuk kemi procesuar këtë msg) ─
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", msg.message_id)
    .maybeSingle();

  if (existingMsg) {
    console.info("Mesazh i dyfishtë, injoruar:", msg.message_id);
    return;
  }

  // ── 3. Gjej ose krijo klientin ──────────────────────────────
  const externalIdField = msg.platform === "whatsapp"
    ? "whatsapp_phone" : "instagram_psid";

  let { data: customer } = await supabase
    .from("customers")
    .select("id, name, display_name, opted_out_of_offers")
    .eq("business_id", businessId)
    .eq(externalIdField, msg.sender_id)
    .maybeSingle();

  if (!customer) {
    const insertData: Record<string, unknown> = {
      business_id: businessId,
      source_channel_id: channelId,
      [externalIdField]: msg.sender_id,
    };
    const { data: newCustomer } = await supabase
      .from("customers")
      .insert(insertData)
      .select("id, name, display_name, opted_out_of_offers")
      .single();
    customer = newCustomer;
  }

  if (!customer) {
    console.error("Klienti nuk u gjet/krijua");
    return;
  }

  const customerId = (customer as CustomerRecord).id;

  // ── 4. Rate limiting: 300 mesazhe/minutë per kanal ──────────
  const { count: recentCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", channelId)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());

  if ((recentCount ?? 0) > 300) {
    console.warn(`Rate limit i arritur, kanali: ${channelId}`);
    return;
  }

  // ── 5. Opt-out check (prioritet #1) ─────────────────────────
  const isOptOut = OPT_OUT_KEYWORDS.some(kw =>
    msg.message_text.toLowerCase().includes(kw)
  );
  if (isOptOut || (customer as CustomerRecord).opted_out_of_offers) {
    if (isOptOut) {
      await supabase
        .from("customers")
        .update({ opted_out_of_offers: true })
        .eq("id", customerId);

      const token = (channel as ChannelRecord).access_token_encrypted;
      await sendToChannel(
        msg.platform, msg.sender_id,
        "E kuptova — nuk do të marrësh më oferta nga ne. Gjithmonë mund të na kontaktosh nëse ke nevojë.",
        token
      ).catch(e => console.warn("Opt-out reply fail:", e));
    }
    return;
  }

  // ── 6. Handoff keyword check ─────────────────────────────────
  const wantsHuman = HANDOFF_KEYWORDS.some(kw =>
    msg.message_text.toLowerCase().includes(kw)
  );

  // ── 7. Gjej ose krijo bisedën ────────────────────────────────
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id, status, ai_replies_count")
    .eq("channel_id", channelId)
    .eq("customer_id", customerId)
    .in("status", ["open", "ai_handling"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const { data: newConv } = await supabase
      .from("conversations")
      .insert({
        business_id: businessId,
        channel_id: channelId,
        customer_id: customerId,
        status: "ai_handling",
      })
      .select("id, status, ai_replies_count")
      .single();
    conversation = newConv;
  }

  if (!conversation) {
    console.error("Biseda nuk u gjend/krijua");
    return;
  }

  const conversationId = (conversation as ConversationRecord).id;
  const totalReplies = ((conversation as ConversationRecord).ai_replies_count ?? 0) + 1;

  // ── 8. Ruaj mesazhin hyrës ───────────────────────────────────
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    channel_id: channelId,
    role: "user",
    content: msg.message_text,
    external_message_id: msg.message_id,
    created_at: new Date(msg.timestamp_ms).toISOString(),
  });

  // ── 9. Nëse dëshiron njeri → handoff menjëherë ──────────────
  if (wantsHuman) {
    await supabase
      .from("conversations")
      .update({ status: "awaiting_human" })
      .eq("id", conversationId);

    // Post-processing edhe pas handoff (mëso nga biseda)
    triggerPostProcessing(conversationId, businessId, customerId,
      msg.message_text, "user", false, false, totalReplies, 0);
    return;
  }

  // ── 10. Kontrollo limitin e planit ───────────────────────────
  const { data: biz } = await supabase
    .from("businesses")
    .select("trial_status, ai_replies_used_this_period")
    .eq("id", businessId)
    .single();

  const bizData = biz as BusinessRecord | null;
  const overQuota =
    bizData?.trial_status === "expired" ||
    (bizData?.ai_replies_used_this_period ?? 0) >= 3000;

  if (overQuota) {
    await supabase
      .from("conversations")
      .update({ status: "awaiting_human" })
      .eq("id", conversationId);
    return;
  }

  // ── 11. Ndërto system prompt (3 shtresa) ─────────────────────
  const { prompt: enrichedPrompt, phase } = await buildEnrichedSystemPrompt(
    businessId, customerId, msg.message_text
  );

  // ── 12. Historiku i bisedës ──────────────────────────────────
  const { data: recentMsgs } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES_HISTORY + 1);

  const history = (recentMsgs ?? [])
    .reverse()
    .slice(0, -1) // hiq mesazhin e sapo shtuar
    .map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // ── 13. Gjenero përgjigjen ───────────────────────────────────
  let reply: string;
  let confidence: number;

  try {
    ({ reply, confidence } = await generateReply(enrichedPrompt, history, msg.message_text));
  } catch (aiErr) {
    console.error("AI generation dështoi:", aiErr);
    await supabase
      .from("conversations")
      .update({ status: "awaiting_human" })
      .eq("id", conversationId);
    return;
  }

  // ── 14. Confidence check → handoff nëse e ulët ──────────────
  if (confidence < AI_CONFIDENCE_THRESHOLD) {
    await supabase
      .from("conversations")
      .update({ status: "awaiting_human" })
      .eq("id", conversationId);
    triggerPostProcessing(conversationId, businessId, customerId,
      msg.message_text, "user", false, false, totalReplies, 0);
    return;
  }

  // ── 15. Dërgo përgjigjen ─────────────────────────────────────
  const accessToken = (channel as ChannelRecord).access_token_encrypted;
  // SHËNIM: në deployment real, decryptToken() vjen nga _shared/token-utils.ts

  try {
    await sendToChannel(msg.platform, msg.sender_id, reply, accessToken);
  } catch (sendErr) {
    console.error("Dërgimi dështoi:", sendErr);
    // Ruaj si draft edhe nëse dërgimi dështon
  }

  // ── 16. Ruaj përgjigjen dhe përditëso counter-at ─────────────
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    channel_id: channelId,
    role: "assistant",
    content: reply,
    ai_confidence: confidence,
    journey_phase_at_time: phase,
  });

  await Promise.all([
    supabase.from("conversations")
      .update({ ai_replies_count: totalReplies })
      .eq("id", conversationId),
    supabase.from("businesses")
      .update({
        ai_replies_used_this_period:
          (bizData?.ai_replies_used_this_period ?? 0) + 1
      })
      .eq("id", businessId),
  ]);

  // ── 17. Post-processing (fire-and-forget) ───────────────────
  const hasComplaint = /problem|gabim|pakënaqur|ankesë|issue|complaint/i
    .test(msg.message_text);
  const hasPurchase = /bleva|pagova|porosita|konfirmoj|purchased|paid/i
    .test(msg.message_text);

  triggerPostProcessing(
    conversationId, businessId, customerId,
    msg.message_text, "user",
    hasPurchase, hasComplaint, totalReplies, 0
  );
}

// ----------------------------------------------------------------
// Handler kryesor (webhook-agnostik)
// ----------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  // Meta webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (
      url.searchParams.get("hub.verify_token") ===
      Deno.env.get("META_VERIFY_TOKEN")
    ) {
      return new Response(
        url.searchParams.get("hub.challenge") ?? "",
        { status: 200 }
      );
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Meta kërkon 200 të menjëhershëm — kthe para procesimit
  const immediate200 = new Response("EVENT_RECEIVED", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Proceso asinkron pas kthimit të 200
  (async () => {
    try {
      const body = rawBody as Record<string, unknown>;

      // ── Format Instagram / Facebook ─────────────────────────
      if (body.object === "instagram" || body.object === "page") {
        const platform = body.object === "instagram" ? "instagram" : "facebook";
        const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
        for (const entry of entries) {
          const messaging = (entry.messaging ?? []) as Array<Record<string, unknown>>;
          for (const event of messaging) {
            const message = event.message as Record<string, unknown> | undefined;
            if (!message?.text) continue;
            const sender = event.sender as Record<string, string>;
            const recipient = event.recipient as Record<string, string>;
            await processMessage(supabase, {
              sender_id: sender.id,
              recipient_id: recipient.id,
              message_text: message.text as string,
              message_id: message.mid as string ?? `${Date.now()}`,
              platform,
              timestamp_ms: (event.timestamp as number) ?? Date.now(),
            });
          }
        }
      }

      // ── Format WhatsApp ─────────────────────────────────────
      else if (body.object === "whatsapp_business_account") {
        const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
        for (const entry of entries) {
          const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
          for (const change of changes) {
            const value = change.value as Record<string, unknown> | undefined;
            if (!value) continue;
            const messages = (value.messages ?? []) as Array<Record<string, unknown>>;
            const metadata = value.metadata as Record<string, string> | undefined;
            for (const message of messages) {
              if (message.type !== "text") continue;
              const textContent = (message.text as Record<string, string> | undefined)?.body;
              if (!textContent) continue;
              await processMessage(supabase, {
                sender_id: message.from as string,
                recipient_id: metadata?.phone_number_id ?? "",
                message_text: textContent,
                message_id: message.id as string,
                platform: "whatsapp",
                timestamp_ms: parseInt(message.timestamp as string ?? "0") * 1000,
              });
            }
          }
        }
      }

    } catch (err) {
      console.error("Procesimi i webhook-ut dështoi:", err);
    }
  })();

  return immediate200;
});
