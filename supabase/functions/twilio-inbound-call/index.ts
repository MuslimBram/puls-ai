import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Twilio sends form-encoded data for incoming calls
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value.toString(); });

    const callSid = params.CallSid;
    const callerNumber = params.From || params.Caller || "unknown";
    const calledNumber = params.To || params.Called || "unknown";
    const callerName = params.CallerName || null;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");

    if (!workspaceId) {
      // Return a generic TwiML if no workspace
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } }
      );
    }

    // Create call record
    // Find workspace owner to set user_id
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this service is unavailable.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } }
      );
    }

    const { data: callRecord } = await supabase
      .from("call_records")
      .insert({
        user_id: workspace.owner_id,
        workspace_id: workspaceId,
        contact_phone: callerNumber,
        contact_name: callerName,
        call_direction: "inbound",
        call_status: "ringing",
        channel_provider: "twilio",
        external_call_id: callSid,
      })
      .select()
      .single();

    // Create active call
    await supabase
      .from("active_calls")
      .insert({
        workspace_id: workspaceId,
        caller_number: callerNumber,
        callee_number: calledNumber,
        caller_name: callerName,
        direction: "inbound",
        status: "ringing",
        sip_call_id: callSid,
        call_record_id: callRecord?.id || null,
      });

    // Find an available agent to route to
    const { data: availableAgent } = await supabase
      .from("agent_telephony_state")
      .select("user_id, sip_extension")
      .eq("workspace_id", workspaceId)
      .eq("telephony_status", "online")
      .limit(1)
      .single();

    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-callback?workspace_id=${workspaceId}`;

    let twiml: string;

    if (availableAgent?.sip_extension) {
      // Route to agent's SIP extension
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" action="${statusCallbackUrl}" method="POST">
    <Sip>${escapeXml(availableAgent.sip_extension)}</Sip>
  </Dial>
</Response>`;
    } else if (availableAgent) {
      // No SIP extension — agent will answer via browser (Twilio Client)
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while we connect you to an agent.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" timeout="30">
    <Client>${availableAgent.user_id}</Client>
  </Dial>
  <Say voice="Polly.Amy">Sorry, no agents are available. Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
</Response>`;
    } else {
      // No agents available — queue the call
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Thank you for calling. All agents are currently busy. Please hold.</Say>
  <Play loop="3">http://com.twilio.sounds.music.s3.amazonaws.com/oldDog_-_endless_goodbye_%28instr.%29.mp3</Play>
  <Say voice="Polly.Amy">Sorry, no agents are available at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;

      // Update call status to queued
      await supabase
        .from("active_calls")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .eq("sip_call_id", callSid);
    }

    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("twilio-inbound-call error:", msg);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "application/xml" }, status: 200 }
    );
  }
});

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
