import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyTwilioSignature } from "../_shared/webhook-signatures.ts";
import { extractCalledNumber, resolveWorkspaceFromCalledNumber } from "../_shared/twilio-workspace-resolver.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const event = url.searchParams.get("event");
    const workspaceId = url.searchParams.get("workspace_id");

    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    // SECURITY: Resolve per-workspace credentials from the called/To number FIRST,
    // then verify the Twilio signature with the correct workspace auth token.
    // workspace_id query param alone is NEVER trusted as authorization.
    const calledNumber = extractCalledNumber(rawBody, contentType);
    const wsCreds = await resolveWorkspaceFromCalledNumber(calledNumber, ["voip","sms","voice"], supabase);

    const sigCheck = await verifyTwilioSignature(
      req, rawBody, contentType,
      wsCreds?.decrypted_auth_token  // per-workspace token (falls back to env if null)
    );
    if (!sigCheck.ok) {
      console.warn(`[twilio-status-callback] Signature rejected: ${sigCheck.reason} (called=${calledNumber})`);
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 403, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Resolved workspace (from signed number), NOT from query param
    const resolvedWorkspaceId = wsCreds?.workspace_id ?? workspaceId;
    const params: Record<string, string> = {};
    if (contentType.includes("application/x-www-form-urlencoded")) {
      new URLSearchParams(rawBody).forEach((value, key) => { params[key] = value; });
    }

    const callSid = params.CallSid;
    const callStatus = params.CallStatus;

    if (event === "recording") {
      // Recording completed callback
      const recordingUrl = params.RecordingUrl;
      const recordingDuration = parseInt(params.RecordingDuration || "0", 10);
      const recordingSid = params.RecordingSid;

      if (callSid && recordingUrl) {
        // Find the call record linked to this Twilio SID
        const { data: activeCall } = await supabase
          .from("active_calls")
          .select("call_record_id")
          .eq("sip_call_id", callSid)
          .single();

        if (activeCall?.call_record_id) {
          await supabase
            .from("call_records")
            .update({
              recording_url: `${recordingUrl}.mp3`,
              recording_duration: recordingDuration,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeCall.call_record_id);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Call status update callback
    if (!callSid || !callStatus) {
      return new Response("Missing CallSid or CallStatus", { status: 400, headers: getCors(req) });
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      queued: "queued",
      ringing: "ringing",
      "in-progress": "in_progress",
      completed: "completed",
      busy: "completed",
      "no-answer": "completed",
      canceled: "completed",
      failed: "failed",
    };

    const mappedStatus = statusMap[callStatus] || callStatus;
    const now = new Date().toISOString();

    // Update active_calls
    const updateData: Record<string, unknown> = {
      status: mappedStatus,
      updated_at: now,
    };

    if (callStatus === "in-progress") {
      updateData.answered_at = now;
    }
    if (["completed", "busy", "no-answer", "canceled", "failed"].includes(callStatus)) {
      updateData.ended_at = now;
    }

    const { data: updatedCall } = await supabase
      .from("active_calls")
      .update(updateData)
      .eq("sip_call_id", callSid)
      .select("id, call_record_id, answered_at, agent_user_id, workspace_id")
      .single();

    // Update call record
    if (updatedCall?.call_record_id) {
      const callRecordUpdate: Record<string, unknown> = {
        call_status: mappedStatus,
        updated_at: now,
      };

      // Calculate accurate duration from Twilio's data
      if (params.CallDuration) {
        callRecordUpdate.call_duration = parseInt(params.CallDuration, 10);
      } else if (["completed", "busy", "no-answer", "canceled", "failed"].includes(callStatus) && updatedCall.answered_at) {
        callRecordUpdate.call_duration = Math.floor(
          (new Date(now).getTime() - new Date(updatedCall.answered_at).getTime()) / 1000
        );
      }

      await supabase
        .from("call_records")
        .update(callRecordUpdate)
        .eq("id", updatedCall.call_record_id);
    }

    // Update agent state on call completion
    if (["completed", "busy", "no-answer", "canceled", "failed"].includes(callStatus) && updatedCall?.agent_user_id) {
      const { data: agentState } = await supabase
        .from("agent_telephony_state")
        .select("calls_handled_today")
        .eq("user_id", updatedCall.agent_user_id)
        .single();

      await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: updatedCall.agent_user_id,
          workspace_id: updatedCall.workspace_id,
          telephony_status: "wrap_up",
          current_call_id: null,
          last_call_ended_at: now,
          calls_handled_today: (agentState?.calls_handled_today || 0) + 1,
          updated_at: now,
        }, { onConflict: "user_id" });
    }

    return new Response(JSON.stringify({ received: true, status: mappedStatus }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("twilio-status-callback error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
