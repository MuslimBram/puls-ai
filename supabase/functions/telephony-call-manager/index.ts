import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import {
  executingProvider,
  hangupCall,
  placeCall,
  type ProviderConfig,
  type ProviderId,
  redirectCall,
  SECRET_FIELDS,
} from "../_shared/telephony/providers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

function asStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = getServiceKey()!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, workspace_id, call_id, number, contact_name, deal_id, target_number } = body;
    if (!workspace_id) throw new Error("workspace_id required");

    // SECURITY: request-controlled workspace_id is never trusted on its own.
    // Authorize the authenticated user before any service-role credential read.
    const [{ data: isMember }, { data: isOwned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id }),
      supabase.from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .eq("owner_id", user.id)
        .maybeSingle(),
    ]);
    if (!isMember && !isOwned) {
      return new Response(JSON.stringify({ error: "Forbidden: not a member of this workspace" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { data: voipChannel } = await supabase
      .from("channels")
      .select("id,settings,credentials_encrypted")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "voip")
      .eq("is_enabled", true)
      .single();

    if (!voipChannel?.settings) {
      throw new Error("No telephony provider configured. Please connect your VoIP provider in Settings → Telephony.");
    }

    const settings = asStringRecord(voipChannel.settings);
    const credentials = asStringRecord(voipChannel.credentials_encrypted);
    const provider = settings.provider || "twilio";

    const providerId = provider as ProviderId;
    if (!["twilio", "telnyx", "plivo", "vonage", "custom_sip"].includes(providerId)) {
      throw new Error(`Unknown telephony provider '${provider}'.`);
    }

    // Decrypt every secret this provider needs (server-side only).
    const secrets: Record<string, string> = {};
    for (const key of [...SECRET_FIELDS[providerId], "webhook_token"]) {
      const raw = credentials[key] || settings[key] || "";
      if (raw) secrets[key] = (await decryptIfNeeded(raw)) ?? "";
    }
    const cfg: ProviderConfig = { provider: providerId, settings, secrets };
    const runsOnTwilio = executingProvider(cfg) === "twilio";
    const fromNumber = settings.phone_number;
    if (!fromNumber) throw new Error("No caller ID / phone number configured for the telephony provider.");
    if (runsOnTwilio && (!settings.account_sid || !secrets.auth_token)) {
      throw new Error("Incomplete Twilio credentials. Please update your telephony provider settings.");
    }
    if (!runsOnTwilio && !secrets.webhook_token) {
      throw new Error("Telephony provider webhook is not configured. Re-save the provider in Settings → Telephony.");
    }

    // Callback URLs: Twilio-executed calls use the twilio-* functions; the
    // other providers use telephony-webhook with the channel's URL token.
    const hookBase = `${supabaseUrl}/functions/v1/telephony-webhook?channel=${encodeURIComponent(voipChannel.id)}&wh=${encodeURIComponent(secrets.webhook_token ?? "")}`;
    const markupUrl = (kind: "outbound" | "hold" | "resume" | "transfer", target?: string) => {
      if (runsOnTwilio) {
        const type = kind === "resume" ? "outbound" : kind;
        return `${supabaseUrl}/functions/v1/twilio-twiml?type=${type}&workspace_id=${workspace_id}${target ? `&target=${encodeURIComponent(target)}` : ""}`;
      }
      if (kind === "outbound") return `${hookBase}&event=answer&direction=outbound&agent=${encodeURIComponent(user.id)}`;
      return `${hookBase}&event=control&type=${kind}&agent=${encodeURIComponent(user.id)}${target ? `&target=${encodeURIComponent(target)}` : ""}`;
    };
    const statusUrl = runsOnTwilio
      ? `${supabaseUrl}/functions/v1/twilio-status-callback?workspace_id=${workspace_id}`
      : `${hookBase}&event=status`;

    let result: any = {};

    switch (action) {
      case "make_call": {
        if (!number) throw new Error("Phone number is required");

        const placed = await placeCall(cfg, { to: number, from: fromNumber, answerUrl: markupUrl("outbound"), statusUrl }, fetch);
        if (!placed.ok || !placed.callId) throw new Error(placed.detail);
        const twilioData = { sid: placed.callId };

        const { data: callRecord } = await supabase
          .from("call_records")
          .insert({
            user_id: user.id,
            workspace_id,
            contact_phone: number,
            contact_name: contact_name || null,
            deal_id: deal_id || null,
            call_direction: "outbound",
            call_status: "ringing",
            channel_provider: providerId,
            external_call_id: twilioData.sid,
          })
          .select()
          .single();

        const { data: activeCall } = await supabase
          .from("active_calls")
          .insert({
            workspace_id,
            agent_user_id: user.id,
            caller_number: fromNumber,
            callee_number: number,
            caller_name: contact_name || null,
            direction: "outbound",
            status: "ringing",
            sip_call_id: twilioData.sid,
            call_record_id: callRecord?.id || null,
          })
          .select()
          .single();

        await supabase
          .from("agent_telephony_state")
          .upsert({
            user_id: user.id,
            workspace_id,
            telephony_status: "on_call",
            current_call_id: activeCall?.id || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        result = { call: activeCall, provider: providerId, provider_call_id: twilioData.sid, twilio_sid: runsOnTwilio ? twilioData.sid : undefined };
        break;
      }

      case "end_call": {
        if (!call_id) throw new Error("call_id required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .eq("workspace_id", workspace_id)
          .single();
        if (!call) throw new Error("Call not found in this workspace");

        if (call.sip_call_id) {
          const ended = await hangupCall(cfg, call.sip_call_id, fetch);
          if (!ended.ok) console.error(`${providerId} end call error:`, ended.detail);
        }

        const now = new Date().toISOString();
        await supabase
          .from("active_calls")
          .update({ status: "completed", ended_at: now, updated_at: now })
          .eq("id", call_id)
          .eq("workspace_id", workspace_id);

        if (call.call_record_id && call.answered_at) {
          const duration = Math.floor(
            (new Date(now).getTime() - new Date(call.answered_at).getTime()) / 1000,
          );
          await supabase
            .from("call_records")
            .update({ call_status: "completed", call_duration: duration, updated_at: now })
            .eq("id", call.call_record_id)
            .eq("workspace_id", workspace_id);
        }

        const { data: agentState } = await supabase
          .from("agent_telephony_state")
          .select("calls_handled_today")
          .eq("user_id", user.id)
          .eq("workspace_id", workspace_id)
          .single();

        await supabase
          .from("agent_telephony_state")
          .upsert({
            user_id: user.id,
            workspace_id,
            telephony_status: "wrap_up",
            current_call_id: null,
            last_call_ended_at: now,
            calls_handled_today: (agentState?.calls_handled_today || 0) + 1,
            updated_at: now,
          }, { onConflict: "user_id" });

        result = { ended: true };
        break;
      }

      case "hold_call": {
        if (!call_id) throw new Error("call_id required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .eq("workspace_id", workspace_id)
          .single();
        if (!call) throw new Error("Call not found in this workspace");

        if (call.sip_call_id) {
          const redirected = await redirectCall(cfg, call.sip_call_id, markupUrl("hold"), fetch);
          if (!redirected.ok) throw new Error(redirected.detail);
        }

        await supabase
          .from("active_calls")
          .update({
            status: "on_hold",
            hold_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id)
          .eq("workspace_id", workspace_id);

        result = { held: true };
        break;
      }

      case "resume_call": {
        if (!call_id) throw new Error("call_id required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .eq("workspace_id", workspace_id)
          .single();
        if (!call) throw new Error("Call not found in this workspace");

        if (call.sip_call_id) {
          const redirected = await redirectCall(cfg, call.sip_call_id, markupUrl("resume"), fetch);
          if (!redirected.ok) throw new Error(redirected.detail);
        }

        const holdDuration = call.hold_started_at
          ? Math.floor((Date.now() - new Date(call.hold_started_at).getTime()) / 1000)
          : 0;

        await supabase
          .from("active_calls")
          .update({
            status: "in_progress",
            hold_started_at: null,
            total_hold_seconds: (call.total_hold_seconds || 0) + holdDuration,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id)
          .eq("workspace_id", workspace_id);

        result = { resumed: true };
        break;
      }

      case "transfer_call": {
        if (!call_id || !target_number) throw new Error("call_id and target_number required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .eq("workspace_id", workspace_id)
          .single();
        if (!call) throw new Error("Call not found in this workspace");

        if (call.sip_call_id) {
          const redirected = await redirectCall(cfg, call.sip_call_id, markupUrl("transfer", target_number), fetch);
          if (!redirected.ok) throw new Error(redirected.detail);
        }

        await supabase
          .from("active_calls")
          .update({
            status: "transferring",
            transfer_target: target_number,
            transferred_from: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id)
          .eq("workspace_id", workspace_id);

        await supabase
          .from("agent_telephony_state")
          .upsert({
            user_id: user.id,
            workspace_id,
            telephony_status: "online",
            current_call_id: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        result = { transferred: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("telephony-call-manager error:", message);
    const status = message.startsWith("Forbidden") ? 403 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
