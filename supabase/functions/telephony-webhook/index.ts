/**
 * telephony-webhook — call control for Telnyx, Plivo, Vonage and Custom SIP
 * (Twilio keeps its dedicated twilio-* functions).
 *
 * URL (shown once in Settings → Telephony after saving the provider):
 *   /functions/v1/telephony-webhook?channel=<channel_id>&wh=<token>&event=answer
 *
 * events
 *   answer     inbound call starts (or an outbound call is answered: direction=outbound)
 *   ivr        next IVR step (&node=<id>, digits in the provider payload)
 *   status     call status / hangup events
 *   recording  recording / voicemail finished
 *   control    hold | resume | transfer markup (&type=..., &target=...)
 *
 * SECURITY
 *   1. The channel is looked up by id; the URL token must match the stored
 *      SHA-256 hash (constant-time). Query parameters are never trusted as
 *      tenant identity beyond that.
 *   2. Provider signatures are verified as well when present/configured
 *      (Telnyx ed25519, Plivo V2 HMAC, Vonage signed JWT). A present but
 *      invalid signature is always rejected.
 *   3. Secrets are decrypted server-side only.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { type CallAction, type DialTarget, renderCallActions } from "../_shared/telephony/call-actions.ts";
import { buildIvrActions, type IvrFlow, promptsFor } from "../_shared/telephony/ivr-engine.ts";
import {
  defaultVoice,
  executingProvider,
  parseFormOrJson,
  parseInboundEvent,
  PROVIDER_CAPABILITIES,
  type ProviderConfig,
  type ProviderId,
  SECRET_FIELDS,
  sipTrunkUri,
  verifyPlivoSignatureV2,
  verifyTelnyxSignature,
  verifyVonageSignedJwt,
  verifyWebhookToken,
} from "../_shared/telephony/providers.ts";

const SUPPORTED: ProviderId[] = ["telnyx", "plivo", "vonage", "custom_sip"];
const TERMINAL = ["completed", "busy", "no_answer", "canceled", "failed"];

function asStringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

const reply = (body: string, contentType = "application/json", status = 200) =>
  new Response(body, { status, headers: { "Content-Type": contentType } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channel") ?? "";
  const token = url.searchParams.get("wh");
  const event = url.searchParams.get("event") ?? "answer";
  const rawBody = req.method === "GET" ? "" : await req.text();
  const contentType = req.headers.get("content-type") ?? "";

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!, { auth: { persistSession: false } });

  const { data: channel } = await sb.from("channels")
    .select("id, user_id, workspace_id, is_enabled, settings, credentials_encrypted")
    .eq("id", channelId)
    .in("channel_type", ["voip", "voice"])
    .maybeSingle();

  const settings = asStringRecord(channel?.settings);
  const provider = settings.provider as ProviderId;
  if (!channel || !channel.is_enabled || !SUPPORTED.includes(provider) || !channel.workspace_id) {
    return reply(JSON.stringify({ error: "unknown channel" }), "application/json", 404);
  }
  if (!(await verifyWebhookToken(token, settings.webhook_token_hash))) {
    console.warn(`[telephony-webhook] bad token for channel ${channelId}`);
    return reply(JSON.stringify({ error: "forbidden" }), "application/json", 403);
  }

  const encrypted = asStringRecord(channel.credentials_encrypted);
  const secrets: Record<string, string> = {};
  for (const key of SECRET_FIELDS[provider]) {
    if (encrypted[key]) secrets[key] = (await decryptIfNeeded(encrypted[key])) ?? "";
  }
  const cfg: ProviderConfig = { provider, settings, secrets };
  const exec = executingProvider(cfg);

  // ── Provider signature (defence in depth) ─────────────────────────────────
  if (exec === "telnyx") {
    const sig = req.headers.get("telnyx-signature-ed25519");
    if (settings.public_key && (sig || settings.require_signature === "true")) {
      const ok = await verifyTelnyxSignature(sig, req.headers.get("telnyx-timestamp"), rawBody, settings.public_key);
      if (!ok) return reply(JSON.stringify({ error: "invalid signature" }), "application/json", 403);
    }
  } else if (exec === "plivo") {
    const sig = req.headers.get("x-plivo-signature-v2");
    if (sig || settings.require_signature === "true") {
      const ok = await verifyPlivoSignatureV2(req.url, req.headers.get("x-plivo-signature-v2-nonce"), sig, secrets.auth_token ?? "");
      if (!ok) return reply(JSON.stringify({ error: "invalid signature" }), "application/json", 403);
    }
  } else if (exec === "vonage") {
    const auth = req.headers.get("authorization");
    if (secrets.signature_secret && (auth || settings.require_signature === "true")) {
      const ok = await verifyVonageSignedJwt(auth, secrets.signature_secret, rawBody);
      if (!ok) return reply(JSON.stringify({ error: "invalid signature" }), "application/json", 403);
    }
  }

  const fields = parseFormOrJson(rawBody, contentType);
  const ev = parseInboundEvent(provider, fields, url.searchParams);
  const workspaceId = channel.workspace_id as string;
  const format = PROVIDER_CAPABILITIES[provider === "custom_sip" ? (exec === "twilio" ? "twilio" : "telnyx") : provider].markup;
  const voiceDefaults = defaultVoice(provider, settings.voice_language || "sq-AL", settings.bridge_provider as "twilio" | "telnyx");
  const voice = { language: voiceDefaults.language, voice: settings.tts_voice || voiceDefaults.voice };
  const now = new Date().toISOString();

  const base = `${url.origin}${url.pathname}?channel=${encodeURIComponent(channelId)}&wh=${encodeURIComponent(token!)}`;
  const urls = {
    step: (nodeId: string) => `${base}&event=ivr&node=${encodeURIComponent(nodeId)}`,
    recording: `${base}&event=recording`,
  };
  const render = (actions: CallAction[]) => {
    const m = renderCallActions(actions, format);
    return reply(m.body, m.contentType);
  };

  // Agents reachable without a browser softphone: SIP extensions, or the workspace forward number.
  const agentTargets = async (onlyUserId?: string | null): Promise<DialTarget[]> => {
    let q = sb.from("agent_telephony_state")
      .select("user_id, sip_extension, telephony_status, calls_handled_today")
      .eq("workspace_id", workspaceId);
    q = onlyUserId ? q.eq("user_id", onlyUserId) : q.eq("telephony_status", "online");
    const { data: agents } = await q;
    const targets: DialTarget[] = [];
    for (const a of (agents ?? []).sort((x, y) => (x.calls_handled_today || 0) - (y.calls_handled_today || 0))) {
      if (a.sip_extension) targets.push({ type: "sip", value: a.sip_extension });
    }
    if (targets.length === 0 && settings.agent_forward_number) {
      const trunk = sipTrunkUri(cfg, settings.agent_forward_number);
      targets.push(trunk ? { type: "sip", value: trunk, username: settings.sip_username, password: secrets.sip_password } : { type: "number", value: settings.agent_forward_number });
    }
    return targets;
  };

  try {
    switch (event) {
      case "answer":
      case "ivr": {
        const direction = url.searchParams.get("direction");
        if (event === "answer" && direction === "outbound") {
          // Outbound click-to-call: the customer answered → connect the agent.
          const p = promptsFor(voice.language);
          const targets = await agentTargets(url.searchParams.get("agent"));
          if (!targets.length) return render([{ kind: "say", text: p.noAgents, ...voice }, { kind: "hangup" }]);
          return render([
            { kind: "say", text: p.connecting, ...voice },
            { kind: "dial", targets, record: true, recordingCallbackUrl: urls.recording, callerId: settings.phone_number, timeoutSec: 30 },
          ]);
        }

        if (event === "answer" && ev.callId) {
          const { data: ws } = await sb.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
          const { data: existing } = await sb.from("active_calls").select("id").eq("sip_call_id", ev.callId).eq("workspace_id", workspaceId).maybeSingle();
          if (!existing) {
            const { data: record } = await sb.from("call_records").insert({
              user_id: ws?.owner_id ?? channel.user_id,
              workspace_id: workspaceId,
              contact_phone: ev.from || "unknown",
              call_direction: "inbound",
              call_status: "ringing",
              channel_provider: provider,
              external_call_id: ev.callId,
            }).select("id").single();
            await sb.from("active_calls").insert({
              workspace_id: workspaceId,
              caller_number: ev.from || "unknown",
              callee_number: ev.to || settings.phone_number || "unknown",
              direction: "inbound",
              status: "ringing",
              sip_call_id: ev.callId,
              call_record_id: record?.id ?? null,
            });
          }
        }

        const { data: flow } = await sb.from("ivr_flows")
          .select("nodes, edges, settings")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true)
          .maybeSingle();
        const { data: queue } = await sb.from("call_queues")
          .select("strategy").eq("workspace_id", workspaceId).eq("is_active", true)
          .order("priority", { ascending: false }).limit(1).maybeSingle();

        const actions = buildIvrActions({
          flow: (flow as IvrFlow | null) ?? null,
          nodeId: event === "ivr" ? url.searchParams.get("node") : null,
          digits: ev.digits,
          now: new Date(),
          urls,
          voice,
          agentTargets: await agentTargets(),
          routingStrategy: (queue?.strategy as "round_robin" | "least_busy" | "ring_all") ?? "round_robin",
          inlineRedirects: format === "vonage_ncco",
          callerId: settings.phone_number,
          holdMusicUrl: settings.hold_music_url,
        });
        return render(actions);
      }

      case "control": {
        const type = url.searchParams.get("type");
        const p = promptsFor(voice.language);
        if (type === "hold") {
          const hold: CallAction[] = settings.hold_music_url
            ? [{ kind: "say", text: p.transferring.split(".")[0] + ".", ...voice }, { kind: "play", url: settings.hold_music_url, loop: 10 }]
            : [{ kind: "say", text: voice.language.startsWith("sq") ? "Ju lutem prisni në linjë." : "Please hold.", ...voice }, { kind: "pause", seconds: 60 }];
          return render(hold);
        }
        if (type === "transfer") {
          const target = url.searchParams.get("target") ?? "";
          const trunk = sipTrunkUri(cfg, target);
          return render([
            { kind: "say", text: p.transferring, ...voice },
            { kind: "dial", targets: [trunk ? { type: "sip", value: trunk } : { type: "number", value: target }], record: true, recordingCallbackUrl: urls.recording, callerId: settings.phone_number },
          ]);
        }
        // resume → reconnect the agent
        const targets = await agentTargets(url.searchParams.get("agent"));
        return render(targets.length
          ? [{ kind: "dial", targets, record: true, recordingCallbackUrl: urls.recording, callerId: settings.phone_number }]
          : [{ kind: "say", text: p.noAgents, ...voice }, { kind: "hangup" }]);
      }

      case "recording": {
        if (ev.recordingUrl) {
          const ids = [ev.callId, ev.requestId].filter(Boolean) as string[];
          const { data: call } = await sb.from("active_calls").select("call_record_id").eq("workspace_id", workspaceId).in("sip_call_id", ids).limit(1).maybeSingle();
          if (call?.call_record_id) {
            await sb.from("call_records").update({
              recording_url: ev.recordingUrl,
              recording_duration: ev.durationSec ?? null,
              updated_at: now,
            }).eq("id", call.call_record_id);
          }
        }
        // Plivo/Telnyx continue the markup after <Record action>; end politely.
        return format === "vonage_ncco" ? reply("[]") : render([{ kind: "say", text: promptsFor(voice.language).thanksBye, ...voice }, { kind: "hangup" }]);
      }

      case "status": {
        if (!ev.callId && !ev.requestId) return reply(JSON.stringify({ received: true }));
        const status = ev.status;
        if (!status) return reply(JSON.stringify({ received: true, ignored: true }));
        const mapped = TERMINAL.includes(status) ? (status === "failed" ? "failed" : "completed") : status;
        const update: Record<string, unknown> = { status: mapped, updated_at: now };
        if (status === "in_progress") update.answered_at = now;
        if (TERMINAL.includes(status)) update.ended_at = now;
        // Plivo outbound calls are created with a request id; switch to the real call id.
        if (ev.requestId && ev.callId && ev.requestId !== ev.callId) update.sip_call_id = ev.callId;
        const ids = [ev.callId, ev.requestId].filter(Boolean) as string[];
        const { data: call } = await sb.from("active_calls")
          .update(update)
          .eq("workspace_id", workspaceId)
          .in("sip_call_id", ids)
          .select("id, call_record_id, answered_at, agent_user_id")
          .maybeSingle();
        if (call?.call_record_id) {
          const recUpdate: Record<string, unknown> = { call_status: mapped, updated_at: now };
          if (ev.durationSec != null) recUpdate.call_duration = ev.durationSec;
          else if (TERMINAL.includes(status) && call.answered_at) {
            recUpdate.call_duration = Math.floor((Date.now() - new Date(call.answered_at).getTime()) / 1000);
          }
          await sb.from("call_records").update(recUpdate).eq("id", call.call_record_id);
        }
        if (TERMINAL.includes(status) && call?.agent_user_id) {
          const { data: state } = await sb.from("agent_telephony_state").select("calls_handled_today").eq("user_id", call.agent_user_id).maybeSingle();
          await sb.from("agent_telephony_state").upsert({
            user_id: call.agent_user_id,
            workspace_id: workspaceId,
            telephony_status: "wrap_up",
            current_call_id: null,
            last_call_ended_at: now,
            calls_handled_today: (state?.calls_handled_today || 0) + 1,
            updated_at: now,
          }, { onConflict: "user_id" });
        }
        return reply(JSON.stringify({ received: true, status: mapped }));
      }

      default:
        return reply(JSON.stringify({ error: "unknown event" }), "application/json", 400);
    }
  } catch (error) {
    console.error("[telephony-webhook] error:", error instanceof Error ? error.message : error);
    if (event === "status" || event === "recording") return reply(JSON.stringify({ error: "internal" }), "application/json", 500);
    // Never leave a caller in silence.
    return render([{ kind: "say", text: promptsFor(voice.language).goodbye, ...voice }, { kind: "hangup" }]);
  }
});
