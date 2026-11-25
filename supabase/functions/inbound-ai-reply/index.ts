// supabase/functions/inbound-ai-reply/index.ts
// ============================================================================
// CANONICAL inbound AI reply orchestrator.
//
// One orchestrator for every channel. WhatsApp, Telegram, Email and website
// chat differ only in how the inbound message arrived and which send-* function
// carries the reply out; everything between is identical and lives here.
//
// Contract:
//   POST { mode: "drain", limit?: number }        <- pg_cron, x-cron-secret
//   POST { inbox_message_id: "<uuid>" }           <- targeted replay, x-cron-secret
//
// The caller supplies an inbox_message_id and nothing else that matters.
// workspace, user, channel, credentials, thread and recipient identity are all
// read from the database. Nothing about the destination is trusted from the
// request body.
// ============================================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { callAIRouterDetailed } from "../_shared/ai-router-helper.ts";

const MAX_HISTORY_MESSAGES = 10;
const MAX_REPLY_TOKENS = 400;
const MAX_INBOUND_CHARS = 4000;
const DEFAULT_DRAIN_LIMIT = 5;

const SUPPORTED_CHANNELS = new Set(["whatsapp", "telegram", "email", "website_chat"]);

type Job = {
  id: string;
  inbox_message_id: string;
  workspace_id: string;
  user_id: string | null;
  channel_id: string | null;
  channel_type: string;
  thread_id: string | null;
  attempts: number;
  max_attempts: number;
  dispatch_id: string;
};

type InboxMessage = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  channel_id: string | null;
  channel_type: string;
  thread_id: string | null;
  direction: string | null;
  sender_name: string | null;
  sender_identifier: string | null;
  message_content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ── Outcome plumbing ────────────────────────────────────────────────────────
// `retry` is distinct from `failed`: the RPC decides which one a retry becomes
// based on attempts vs max_attempts. A transient provider or network fault must
// never be recorded as a permanent failure on its first occurrence.
type Outcome =
  | { kind: "succeeded"; usageRequestId: string | null; outboundInboxMessageId: string | null; providerMessageId: string | null }
  | { kind: "skipped"; reason: string }
  | { kind: "retry"; error: string; usageRequestId?: string | null };

async function completeJob(sb: SupabaseClient, job: Job, outcome: Outcome): Promise<void> {
  const params: Record<string, unknown> = {
    _job_id: job.id,
    _status: outcome.kind,
    _skip_reason: null,
    _last_error: null,
    _ai_usage_request_id: null,
    _outbound_inbox_message_id: null,
    _provider_message_id: null,
  };

  if (outcome.kind === "skipped") {
    params._skip_reason = outcome.reason;
  } else if (outcome.kind === "retry") {
    params._last_error = outcome.error;
    params._ai_usage_request_id = outcome.usageRequestId ?? null;
  } else {
    params._ai_usage_request_id = outcome.usageRequestId;
    params._outbound_inbox_message_id = outcome.outboundInboxMessageId;
    params._provider_message_id = outcome.providerMessageId;
  }

  const { error } = await sb.rpc("ai_reply_complete_job", params);
  if (error) console.error("[inbound-ai-reply] complete failed:", job.id, error.code ?? "unknown");
}

// ── Recipient resolution ────────────────────────────────────────────────────
// Every value here comes from the stored inbound row, never from a caller.
function resolveRecipient(msg: InboxMessage): { ok: true; to: string } | { ok: false; reason: string } {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const identifier = (msg.sender_identifier ?? "").trim();

  if (msg.channel_type === "telegram") {
    const chatId = meta.chat_id;
    if (chatId !== undefined && chatId !== null && String(chatId).trim()) {
      return { ok: true, to: String(chatId).trim() };
    }
    // sender_identifier is stored as `telegram:<user id>`; for private chats the
    // chat id equals the user id, so this is a correct fallback, but only then.
    if (identifier.startsWith("telegram:")) {
      const raw = identifier.slice("telegram:".length);
      if (raw) return { ok: true, to: raw };
    }
    return { ok: false, reason: "telegram_chat_id_missing" };
  }

  if (msg.channel_type === "whatsapp") {
    const waId = typeof meta.wa_id === "string" ? meta.wa_id.trim() : "";
    const to = waId || identifier;
    if (!to) return { ok: false, reason: "whatsapp_recipient_missing" };
    return { ok: true, to };
  }

  if (msg.channel_type === "email") {
    if (!identifier.includes("@")) return { ok: false, reason: "email_recipient_missing" };
    return { ok: true, to: identifier };
  }

  if (msg.channel_type === "website_chat") {
    // No outbound transport: the reply is delivered by storing it on the thread,
    // which is what the web widget reads.
    return { ok: true, to: identifier || "visitor" };
  }

  return { ok: false, reason: "channel_type_unsupported" };
}

// ── Prompt assembly ─────────────────────────────────────────────────────────
async function buildPrompt(
  sb: SupabaseClient,
  job: Job,
  msg: InboxMessage,
): Promise<{ system: string; messages: Array<{ role: string; content: string }> }> {
  const [{ data: agent }, { data: business }] = await Promise.all([
    sb.from("ai_agent_configs")
      .select("agent_name, agent_tone, language, custom_instructions, business_description, business_hours")
      .eq("workspace_id", job.workspace_id)
      .maybeSingle(),
    sb.from("business_profiles")
      .select("business_name, industry, main_services, short_description, target_audience, ai_tone, language")
      .eq("workspace_id", job.workspace_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const lines = [
    `You are ${agent?.agent_name ?? "the assistant"} replying on behalf of a business.`,
    `Channel: ${msg.channel_type}. Customer: ${msg.sender_name ?? "customer"}.`,
    `Tone: ${agent?.agent_tone ?? business?.ai_tone ?? "professional and friendly"}.`,
    `Reply in the same language the customer wrote in${agent?.language ? ` (default ${agent.language})` : ""}.`,
  ];

  if (business?.business_name) lines.push(`Business: ${business.business_name}`);
  if (business?.industry) lines.push(`Industry: ${business.industry}`);
  if (business?.main_services) lines.push(`Services: ${business.main_services}`);
  if (business?.short_description) lines.push(`About: ${business.short_description}`);
  if (business?.target_audience) lines.push(`Audience: ${business.target_audience}`);
  if (agent?.business_description) lines.push(`Description: ${agent.business_description}`);
  if (agent?.business_hours) lines.push(`Business hours: ${JSON.stringify(agent.business_hours)}`);
  if (agent?.custom_instructions) lines.push(`\nSPECIAL INSTRUCTIONS:\n${agent.custom_instructions}`);

  lines.push(
    "",
    "Rules:",
    "- Answer only from the business context above.",
    "- Never invent prices, dates, availability or promises.",
    "- If you do not know, say so plainly and offer to have a colleague follow up.",
    "- Keep it to 2-4 sentences and end with a clear next step.",
    "- Write the reply text only. No preamble, no quoting, no signature block.",
  );

  // Thread history gives multi-turn continuity; without a thread we answer the
  // single message rather than guessing at siblings.
  const history: Array<{ role: string; content: string }> = [];
  if (job.thread_id) {
    const { data: prior } = await sb
      .from("inbox_messages")
      .select("direction, message_content, created_at")
      .eq("workspace_id", job.workspace_id)
      .eq("thread_id", job.thread_id)
      .lt("created_at", msg.created_at)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    for (const row of (prior ?? []).reverse()) {
      const content = String(row.message_content ?? "").slice(0, 1000);
      if (!content) continue;
      history.push({ role: row.direction === "outbound" ? "assistant" : "user", content });
    }
  }

  history.push({
    role: "user",
    content: String(msg.message_content ?? "").slice(0, MAX_INBOUND_CHARS),
  });

  return { system: lines.join("\n"), messages: history };
}

// ── Outbound ────────────────────────────────────────────────────────────────
type SendResult =
  | { ok: true; providerMessageId: string | null; outboundInboxMessageId: string | null }
  | { ok: false; error: string };

async function dispatchOutbound(
  sb: SupabaseClient,
  job: Job,
  msg: InboxMessage,
  to: string,
  replyText: string,
): Promise<SendResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  if (!supabaseUrl || !internalSecret) {
    return { ok: false, error: "internal_dispatch_not_configured" };
  }

  // website_chat has no provider to call. The reply IS the stored row.
  if (msg.channel_type === "website_chat") {
    const { data: inserted, error } = await sb.from("inbox_messages").insert({
      user_id: job.user_id,
      workspace_id: job.workspace_id,
      channel_id: job.channel_id,
      channel_type: "website_chat",
      source_name: "Pulse AI",
      sender_name: "Pulse AI",
      sender_identifier: "ai",
      message_content: replyText,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: "delivered",
      thread_id: job.thread_id,
      metadata: { ai_reply_job_id: job.id, in_reply_to_inbox_message_id: msg.id },
    } as never).select("id").single();
    if (error) return { ok: false, error: `website_chat_persist_failed: ${error.code ?? "unknown"}` };
    return { ok: true, providerMessageId: null, outboundInboxMessageId: inserted?.id ?? null };
  }

  const target: Record<string, string> = {
    whatsapp: "send-whatsapp",
    telegram: "send-telegram",
    email: "send-email",
  };
  const fn = target[msg.channel_type];
  if (!fn) return { ok: false, error: "channel_type_unsupported" };

  // Only routing facts. No credentials, no user_id, no workspace override.
  // Named sendBody, not body, so that "the orchestrator never reads routing
  // facts out of its own request body" stays checkable by grep.
  const sendBody: Record<string, unknown> = {
    workspace_id: job.workspace_id,
    channel_id: job.channel_id,
    dispatch_id: job.dispatch_id,
    inbox_message_id: msg.id,
    ai_reply_job_id: job.id,
  };

  if (msg.channel_type === "whatsapp") {
    sendBody.to = to;
    sendBody.message = replyText;
  } else if (msg.channel_type === "telegram") {
    sendBody.chat_id = to;
    sendBody.message = replyText;
  } else {
    sendBody.to = to;
    sendBody.body = replyText;
    const meta = (msg.metadata ?? {}) as Record<string, unknown>;
    const subject = typeof meta.subject === "string" ? meta.subject : "";
    sendBody.subject = subject ? (subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`) : "Re: your message";
    if (typeof meta.external_message_id === "string") {
      sendBody.reply_to_message_id = meta.external_message_id;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServiceKey()}`,
        apikey: getServiceKey() ?? "",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(sendBody),
    });
  } catch (e) {
    return { ok: false, error: `send_unreachable: ${e instanceof Error ? e.message : "unknown"}` };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await res.json() as Record<string, unknown>;
  } catch {
    // keep payload empty; status decides
  }

  if (!res.ok) {
    return { ok: false, error: `send_failed_${res.status}: ${String(payload.code ?? payload.error ?? "")}`.slice(0, 300) };
  }

  // A replayed dispatch comes back already-sent rather than sending twice.
  return {
    ok: true,
    providerMessageId: payload.message_id ? String(payload.message_id) : null,
    outboundInboxMessageId: payload.inbox_message_id ? String(payload.inbox_message_id) : null,
  };
}

// ── One job ─────────────────────────────────────────────────────────────────
async function processJob(sb: SupabaseClient, job: Job): Promise<string> {
  const { data: msg, error: msgError } = await sb
    .from("inbox_messages")
    .select("id, workspace_id, user_id, channel_id, channel_type, thread_id, direction, sender_name, sender_identifier, message_content, metadata, created_at")
    .eq("id", job.inbox_message_id)
    .maybeSingle();

  if (msgError) {
    await completeJob(sb, job, { kind: "retry", error: `inbox_lookup_failed: ${msgError.code ?? "unknown"}` });
    return "retry";
  }
  if (!msg) {
    await completeJob(sb, job, { kind: "skipped", reason: "inbox_message_deleted" });
    return "skipped";
  }

  const inbound = msg as InboxMessage;

  // Defence in depth against loops: the trigger already filters on direction,
  // but a replay of this endpoint must not be able to answer an outbound row.
  if (inbound.direction !== "inbound") {
    await completeJob(sb, job, { kind: "skipped", reason: "not_inbound" });
    return "skipped";
  }
  if (inbound.workspace_id !== job.workspace_id) {
    await completeJob(sb, job, { kind: "skipped", reason: "workspace_mismatch" });
    return "skipped";
  }
  if (!SUPPORTED_CHANNELS.has(inbound.channel_type)) {
    await completeJob(sb, job, { kind: "skipped", reason: "channel_type_unsupported" });
    return "skipped";
  }
  const text = String(inbound.message_content ?? "").trim();
  if (!text) {
    await completeJob(sb, job, { kind: "skipped", reason: "empty_message" });
    return "skipped";
  }

  const { data: eligibility, error: eligError } = await sb.rpc("ai_reply_eligibility", {
    _workspace_id: job.workspace_id,
    _channel_id: job.channel_id,
    _thread_id: job.thread_id,
    _channel_type: inbound.channel_type,
  });
  if (eligError) {
    await completeJob(sb, job, { kind: "retry", error: `eligibility_failed: ${eligError.code ?? "unknown"}` });
    return "retry";
  }
  const elig = (eligibility ?? {}) as Record<string, unknown>;
  if (elig.eligible !== true) {
    await completeJob(sb, job, { kind: "skipped", reason: String(elig.reason ?? "not_eligible") });
    return "skipped";
  }

  const recipient = resolveRecipient(inbound);
  if (!recipient.ok) {
    await completeJob(sb, job, { kind: "skipped", reason: recipient.reason });
    return "skipped";
  }

  const { system, messages } = await buildPrompt(sb, job, inbound);

  let reply;
  try {
    reply = await callAIRouterDetailed(messages, system, {
      taskType: "customer_support",
      workspaceId: job.workspace_id,
      userId: job.user_id ?? undefined,
      maxTokens: MAX_REPLY_TOKENS,
    });
  } catch (e) {
    // The customer's message is already durably in inbox_messages. An AI
    // failure costs us a retry, never the message.
    await completeJob(sb, job, {
      kind: "retry",
      error: `ai_router_failed: ${e instanceof Error ? e.message : "unknown"}`.slice(0, 400),
    });
    return "retry";
  }

  const replyText = reply.text.trim();
  if (!replyText) {
    await completeJob(sb, job, { kind: "retry", error: "ai_empty_reply", usageRequestId: reply.requestId });
    return "retry";
  }

  const sent = await dispatchOutbound(sb, job, inbound, recipient.to, replyText);
  if (!sent.ok) {
    await completeJob(sb, job, { kind: "retry", error: sent.error, usageRequestId: reply.requestId });
    return "retry";
  }

  // Audit linkage: inbox_message -> workspace -> ai_usage_request -> outbound.
  await sb.from("inbox_messages").update({
    ai_summary: replyText.slice(0, 500),
    first_response_at: new Date().toISOString(),
  }).eq("id", inbound.id).is("first_response_at", null);

  await completeJob(sb, job, {
    kind: "succeeded",
    usageRequestId: reply.requestId,
    outboundInboxMessageId: sent.outboundInboxMessageId,
    providerMessageId: sent.providerMessageId,
  });
  return "succeeded";
}

// ── Entry ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const unauthorized = requireCronAuth(req);
  if (unauthorized) {
    return new Response(unauthorized.body, {
      status: unauthorized.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    // drain with defaults
  }

  try {
    await sb.rpc("ai_reply_reap_stuck_jobs", { _older_than: "10 minutes" });

    // Targeted replay for a single message (operational tool + test hook).
    // Claims that one job only -- claiming a batch here would bump attempts on
    // unrelated jobs and strand them in 'processing' until the reaper.
    if (typeof body.inbox_message_id === "string") {
      const { data: claimedRows, error: claimErr } = await sb.rpc(
        "ai_reply_claim_job_by_message",
        { _inbox_message_id: body.inbox_message_id },
      );
      if (claimErr) throw claimErr;
      const claimed = ((claimedRows ?? []) as Job[])[0];
      if (!claimed) {
        // Either no job exists for that message, or it is not pending: already
        // answered, already skipped, exhausted, or held by another worker.
        return json({ ok: false, error: "job_not_claimable" }, 409);
      }
      const outcome = await processJob(sb, claimed);
      return json({ ok: true, mode: "targeted", job_id: claimed.id, outcome });
    }

    const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : DEFAULT_DRAIN_LIMIT;
    const { data: claimedRows, error: claimErr } = await sb.rpc("ai_reply_claim_jobs", { _limit: limit });
    if (claimErr) throw claimErr;

    const jobs = (claimedRows ?? []) as Job[];
    const results: Record<string, number> = {};
    for (const job of jobs) {
      let outcome = "retry";
      try {
        outcome = await processJob(sb, job);
      } catch (e) {
        console.error("[inbound-ai-reply] job threw:", job.id, e instanceof Error ? e.message : "unknown");
        await completeJob(sb, job, {
          kind: "retry",
          error: `unhandled: ${e instanceof Error ? e.message : "unknown"}`.slice(0, 400),
        });
      }
      results[outcome] = (results[outcome] ?? 0) + 1;
    }

    return json({ ok: true, mode: "drain", claimed: jobs.length, results });
  } catch (e) {
    console.error("[inbound-ai-reply] fatal:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, error: "orchestrator_error" }, 500);
  }
});
