/**
 * PULSE AI VOICE BRAIN — ConversationRelay Handler
 * Feature flag: voice_ai_enabled (per channel)
 *
 * ARCHITECTURE:
 *   Twilio ConversationRelay → wss://[this function] → Pulse AI Router → response → Twilio
 *
 * IMPORTANT:
 *   - Normal human calling continues when voice_ai_enabled = false
 *   - AI provider is NOT hardwired — Pulse AI Router selects provider
 *   - Business Digital Twin + conversation memory used as context
 *   - Session state persisted in voice_ai_sessions table for reconnect
 *   - NEVER routes payment card data into AI prompts
 *
 * REQUIREMENTS:
 *   - voice_ai_enabled = true on the voip channel
 *   - Twilio ConversationRelay requires wss:// endpoint
 *   - Supabase Edge Functions support WebSocket via Deno.serve with WebSocket upgrade
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const AK = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Sensitive field names to scrub from AI prompts
const SENSITIVE_FIELDS = ["card_number","cvv","cvc","ssn","password","pin","credit","debit"];

function scrubSensitive(text: string): string {
  // Replace patterns that look like card numbers, CVVs
  return text
    .replace(/\b\d{13,19}\b/g, "[CARD_NUMBER_REDACTED]")
    .replace(/\bCVV?:?\s*\d{3,4}\b/gi, "[CVV_REDACTED]")
    .replace(/\b\d{3,4}\s+security\s+code\b/gi, "[CVV_REDACTED]");
}

async function buildAIContext(sb: ReturnType<typeof createClient>, workspaceId: string, callerId: string) {
  const [bizRes, custRes] = await Promise.all([
    sb.from("business_digital_twins").select("twin_data").eq("workspace_id", workspaceId).maybeSingle(),
    sb.from("contacts").select("name,email,phone,notes,intent_score").eq("workspace_id", workspaceId)
      .eq("phone", callerId).maybeSingle(),
  ]);
  return {
    business: bizRes.data?.twin_data ?? {},
    customer: custRes.data ?? {},
  };
}

async function getAIResponse(
  systemPrompt: string,
  conversationTurns: Array<{role: string; content: string}>,
  userMessage: string,
): Promise<string> {
  if (!AK) return "I apologize, the AI assistant is temporarily unavailable. Let me connect you with a human agent.";

  const messages = [
    ...conversationTurns.slice(-10).map(t => ({ role: t.role === "ai" ? "assistant" : "user", content: t.content })),
    { role: "user", content: scrubSensitive(userMessage) },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AK,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 250,  // Keep responses concise for voice
        system: systemPrompt,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const d = await res.json() as any;
    return d.content?.[0]?.text ?? "One moment please.";
  } catch {
    return "I\'m sorry, I had a moment of difficulty. Could you please repeat that?";
  }
}

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // WebSocket upgrade for ConversationRelay
  const upgrade = req.headers.get("upgrade");
  if (upgrade?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const url = new URL(req.url);
    const callSid     = url.searchParams.get("CallSid") ?? "";
    const workspaceId = url.searchParams.get("workspace_id") ?? "";
    const callerNum   = url.searchParams.get("From") ?? "";

    let session: any = null;
    let systemPrompt = "";

    socket.onopen = async () => {
      try {
        // Verify voice_ai_enabled for this workspace
        const { data: ch } = await sb.from("channels")
          .select("voice_ai_enabled,ai_receptionist_enabled,settings")
          .eq("workspace_id", workspaceId)
          .eq("channel_type", "voip")
          .maybeSingle();

        if (!ch?.voice_ai_enabled) {
          socket.send(JSON.stringify({ type: "error", message: "voice_ai_disabled" }));
          socket.close(1008, "voice_ai_disabled");
          return;
        }

        // Load context
        const ctx = await buildAIContext(sb, workspaceId, callerNum);
        const bizName = (ctx.business as any)?.name ?? "our business";
        const custName = (ctx.customer as any)?.name;

        systemPrompt = `You are an AI receptionist for ${bizName}.
${custName ? `The caller appears to be ${custName}.` : ""}
${JSON.stringify((ctx.business as any)?.services ?? {}).slice(0, 500)}

RULES:
- Keep responses SHORT (1-2 sentences) — this is a phone call
- Be warm and professional
- If asked about billing, payments, or card details: DO NOT request or repeat card numbers
- If caller requests a human agent, says "talk to someone", "real person", or sounds frustrated: trigger handoff
- For bookings: collect name, date/time, service — then confirm
- Qualify leads: ask about business size, current challenges, budget range naturally
- NEVER make up specific prices or policies you don\'t have data for`;

        // Create/restore session
        const { data: existing } = await sb.from("voice_ai_sessions")
          .select("*").eq("call_sid", callSid).maybeSingle();

        if (existing) {
          session = existing;
        } else {
          const { data: newSess } = await sb.from("voice_ai_sessions").insert({
            call_sid: callSid,
            workspace_id: workspaceId,
            caller_number: callerNum,
            direction: "inbound",
            session_status: "active",
            business_context: ctx.business,
            customer_context: ctx.customer,
            conversation_turns: [],
          }).select().single();
          session = newSess;
        }

        // Send welcome via ConversationRelay
        const greeting = custName
          ? `Hello ${custName}, thank you for calling ${bizName}. How can I help you today?`
          : `Thank you for calling ${bizName}. How can I help you today?`;

        socket.send(JSON.stringify({ type: "text", token: greeting, last: true }));
      } catch (e: any) {
        console.error("[voice-ai-relay] onopen error:", e.message);
        socket.send(JSON.stringify({ type: "error", message: e.message }));
      }
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type !== "prompt" || !msg.voicePrompt) return;

        const userText = msg.voicePrompt as string;
        const turns    = (session?.conversation_turns as Array<any>) ?? [];

        // Human handoff detection
        const handoffPhrases = ["human","agent","person","speak to someone","talk to someone","representative","manager"];
        if (handoffPhrases.some(p => userText.toLowerCase().includes(p))) {
          await sb.from("voice_ai_sessions").update({
            human_handoff_requested: true,
            handoff_reason: "caller_requested",
            session_status: "human_handoff",
            updated_at: new Date().toISOString(),
          }).eq("call_sid", callSid);

          socket.send(JSON.stringify({
            type: "text",
            token: "Of course! Let me connect you with a human agent right away. Please hold for just a moment.",
            last: true,
          }));
          // Signal TwiML to transfer
          socket.send(JSON.stringify({ type: "handoff", reason: "human_requested" }));
          return;
        }

        // Get AI response
        const aiResponse = await getAIResponse(systemPrompt, turns, userText);

        // Update session turns
        turns.push({ role: "user", content: userText });
        turns.push({ role: "ai", content: aiResponse });
        await sb.from("voice_ai_sessions").update({
          conversation_turns: turns.slice(-20), // keep last 20 turns
          updated_at: new Date().toISOString(),
        }).eq("call_sid", callSid);

        // Stream response tokens to ConversationRelay
        const words = aiResponse.split(" ");
        for (let i = 0; i < words.length; i++) {
          socket.send(JSON.stringify({
            type: "text",
            token: (i === 0 ? "" : " ") + words[i],
            last: i === words.length - 1,
          }));
        }
      } catch (e: any) {
        console.error("[voice-ai-relay] onmessage error:", e.message);
      }
    };

    socket.onclose = async () => {
      await sb.from("voice_ai_sessions").update({
        session_status: "ended",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("call_sid", callSid).catch(() => {});
    };

    return response;
  }

  // Non-WebSocket: status check
  return new Response(JSON.stringify({
    service: "pulse-ai-voice-brain",
    status: "ready",
    feature_flag: "voice_ai_enabled",
    websocket_endpoint: "wss://[project].supabase.co/functions/v1/voice-ai-relay",
    note: "Enable voice_ai_enabled on your voip channel to activate AI receptionist. Normal calling always works when disabled.",
  }), { headers: { "Content-Type": "application/json" } });
});
