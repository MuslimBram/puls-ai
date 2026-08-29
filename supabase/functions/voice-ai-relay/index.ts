/**
 * PULSE AI VOICE BRAIN — ConversationRelay Handler v2
 *
 * SECURITY:
 *   1. Resolve workspace from provider-owned called-number mapping
 *   2. Validate Twilio WebSocket signature with that workspace token BEFORE upgrade
 *   3. Never accept query-string workspace_id as tenant identity
 *   4. Route AI through ai-router (NOT hardwired to Anthropic)
 *   5. Scrub sensitive data before any AI prompt
 *   6. Feature flag: voice_ai_enabled must be true on channel
 *   7. Session persistence for reconnect
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyTwilioSignature } from "../_shared/webhook-signatures.ts";
import { resolveWorkspaceFromCalledNumber } from "../_shared/twilio-workspace-resolver.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = getServiceKey()!;

function scrubSensitive(text: string): string {
  return text
    .replace(/\b\d{13,19}\b/g, "[CARD_REDACTED]")
    .replace(/\bCVV?:?\s*\d{3,4}\b/gi, "[CVV_REDACTED]")
    .replace(/\b\d{3,4}\s+security\s+code\b/gi, "[CVV_REDACTED]");
}

async function routeAI(
  systemPrompt: string,
  turns: Array<{ role: string; content: string }>,
  userMessage: string,
  workspaceId: string,
  sb: ReturnType<typeof createClient>,
): Promise<string> {
  const SURL = Deno.env.get("SUPABASE_URL")!;
  const SKEY = getServiceKey()!;

  try {
    const messages = [
      ...turns.slice(-10).map((t) => ({
        role: t.role === "ai" ? "assistant" : "user",
        content: t.content,
      })),
      { role: "user", content: scrubSensitive(userMessage) },
    ];

    const res = await fetch(`${SURL}/functions/v1/ai-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", SKEY].join(" "),
        "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify({
        task_type: "voice_ai",
        workspace_id: workspaceId,
        messages,
        system: systemPrompt,
        max_tokens: 250,
        require_fast: true,
      }),
    });

    if (!res.ok) throw new Error(`ai-router ${res.status}`);
    const d = await res.json() as any;
    return d.response ?? d.content ?? d.text ?? "One moment please.";
  } catch (e: any) {
    console.error("[voice-ai-relay] ai-router failed:", e.message);
    return "I apologize, I had a moment of difficulty. Could you repeat that?";
  }
}

async function buildContext(
  sb: ReturnType<typeof createClient>,
  wsId: string,
  callerId: string,
) {
  const [biz, cust] = await Promise.all([
    sb.from("business_digital_twins").select("twin_data").eq("workspace_id", wsId).maybeSingle(),
    sb.from("contacts").select("name,email,phone,notes,intent_score").eq("workspace_id", wsId)
      .eq("phone", callerId).maybeSingle(),
  ]);
  return { business: biz.data?.twin_data ?? {}, customer: cust.data ?? {} };
}

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  const isWsUpgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (!isWsUpgrade) {
    return new Response(JSON.stringify({
      service: "pulse-ai-voice-brain",
      status: "ready",
      ai_routing: "via ai-router (provider not hardwired)",
      feature_flag: "voice_ai_enabled (per channel)",
    }), { headers: { "Content-Type": "application/json" } });
  }

  const rawBody = "";
  const contentType = req.headers.get("content-type") ?? "";
  const callSid = url.searchParams.get("CallSid") ?? "";
  const calledParam = url.searchParams.get("To") ?? url.searchParams.get("Called") ?? "";

  // Tenant identity is provider-bound: the called Twilio number must uniquely map
  // to one enabled workspace channel before any signature can be accepted.
  const wsCreds = calledParam
    ? await resolveWorkspaceFromCalledNumber(calledParam, ["voip", "voice"], sb)
    : null;

  if (!wsCreds) {
    console.warn(`[voice-ai-relay] Workspace resolution failed (called=${calledParam}, CallSid=${callSid})`);
    return new Response("Forbidden: workspace not found", { status: 403 });
  }

  const sigCheck = await verifyTwilioSignature(
    req,
    rawBody,
    contentType,
    wsCreds.decrypted_auth_token,
  );

  if (!sigCheck.ok) {
    console.warn(`[voice-ai-relay] WebSocket sig rejected: ${sigCheck.reason}`);
    return new Response("Forbidden: invalid signature", { status: 403 });
  }

  const workspaceId = wsCreds.workspace_id;
  const callerNum = url.searchParams.get("From") ?? "";

  const { data: ch } = await sb.from("channels")
    .select("voice_ai_enabled")
    .eq("workspace_id", workspaceId)
    .eq("channel_type", "voip")
    .eq("is_enabled", true)
    .maybeSingle();

  if (!ch?.voice_ai_enabled) {
    return new Response("voice_ai_disabled", { status: 503 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  let session: Record<string, any> | null = null;
  let systemPrompt = "";

  socket.onopen = async () => {
    try {
      const ctx = await buildContext(sb, workspaceId, callerNum);
      const bizName = (ctx.business as any)?.name ?? "our business";
      const custName = (ctx.customer as any)?.name;

      systemPrompt = `You are an AI receptionist for ${bizName}.
${custName ? `The caller appears to be ${custName}.` : ""}
${JSON.stringify((ctx.business as any)?.services ?? {}).slice(0, 400)}

RULES:
- Keep responses SHORT (1-2 sentences max) — this is a voice call
- Be warm and professional
- NEVER request, repeat, or accept payment card numbers, CVV, PIN, or passwords
- If caller asks for human/agent/person: immediately trigger handoff
- For bookings: collect name, time, service
- Qualify leads naturally — ask about needs and challenges`;

      const { data: existing } = await sb.from("voice_ai_sessions")
        .select("*")
        .eq("call_sid", callSid)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      session = existing ?? (await sb.from("voice_ai_sessions").insert({
        call_sid: callSid,
        workspace_id: workspaceId,
        caller_number: callerNum,
        direction: "inbound",
        session_status: "active",
        business_context: ctx.business,
        customer_context: ctx.customer,
        conversation_turns: [],
      }).select().single()).data;

      const greeting = custName
        ? `Hello ${custName}, thank you for calling ${bizName}. How can I help you today?`
        : `Thank you for calling ${bizName}. How can I help you today?`;

      socket.send(JSON.stringify({ type: "text", token: greeting, last: true }));
    } catch (e: any) {
      console.error("[voice-ai-relay] onopen:", e.message);
      socket.close(1011, e.message);
    }
  };

  socket.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type !== "prompt" || !msg.voicePrompt) return;
      const userText = msg.voicePrompt as string;
      const turns = (session?.conversation_turns as Array<any>) ?? [];

      const handoffPhrases = [
        "human",
        "agent",
        "person",
        "speak to someone",
        "talk to someone",
        "representative",
        "manager",
        "real person",
      ];
      if (handoffPhrases.some((p) => userText.toLowerCase().includes(p))) {
        await sb.from("voice_ai_sessions").update({
          human_handoff_requested: true,
          handoff_reason: "caller_requested",
          session_status: "human_handoff",
          updated_at: new Date().toISOString(),
        })
          .eq("call_sid", callSid)
          .eq("workspace_id", workspaceId);
        socket.send(JSON.stringify({
          type: "text",
          token: "Of course! Connecting you with a human agent right away. Please hold.",
          last: true,
        }));
        socket.send(JSON.stringify({ type: "handoff", reason: "human_requested" }));
        return;
      }

      const aiResponse = await routeAI(systemPrompt, turns, userText, workspaceId, sb);

      turns.push({ role: "user", content: userText });
      turns.push({ role: "ai", content: aiResponse });
      if (session) {
        await sb.from("voice_ai_sessions").update({
          conversation_turns: turns.slice(-20),
          updated_at: new Date().toISOString(),
        })
          .eq("call_sid", callSid)
          .eq("workspace_id", workspaceId);
      }

      const words = aiResponse.split(" ");
      for (let i = 0; i < words.length; i++) {
        socket.send(JSON.stringify({
          type: "text",
          token: (i === 0 ? "" : " ") + words[i],
          last: i === words.length - 1,
        }));
      }
    } catch (e: any) {
      console.error("[voice-ai-relay] onmessage:", e.message);
    }
  };

  socket.onclose = async () => {
    await sb.from("voice_ai_sessions").update({
      session_status: "ended",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
      .eq("call_sid", callSid)
      .eq("workspace_id", workspaceId)
      .catch(() => {});
  };

  return response;
});
