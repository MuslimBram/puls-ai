import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    // Fetch business Twilio credentials from channels table
    const { data: voipChannel } = await supabase
      .from("channels")
      .select("settings")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "voip")
      .eq("is_enabled", true)
      .single();

    if (!voipChannel?.settings) {
      throw new Error("No telephony provider configured. Please connect your VoIP provider in Settings → Telephony.");
    }

    const settings = voipChannel.settings as Record<string, string>;
    const provider = settings.provider || "twilio";

    if (provider !== "twilio") {
      throw new Error(`Provider '${provider}' is not yet supported for real calls. Twilio is required.`);
    }

    const accountSid = settings.account_sid;
    const authToken = settings.auth_token;
    const fromNumber = settings.phone_number;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Incomplete Twilio credentials. Please update your telephony provider settings.");
    }

    const twilioAuth = btoa(`${accountSid}:${authToken}`);
    const twilioBase = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    let result: any = {};

    switch (action) {
      case "make_call": {
        if (!number) throw new Error("Phone number is required");

        // Create call via Twilio API
        const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-callback?workspace_id=${workspace_id}`;
        const twimlUrl = `${supabaseUrl}/functions/v1/twilio-twiml?type=outbound&workspace_id=${workspace_id}`;

        const twilioRes = await fetch(`${twilioBase}/Calls.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: number,
            From: fromNumber,
            Url: twimlUrl,
            StatusCallback: statusCallbackUrl,
            StatusCallbackEvent: "initiated ringing answered completed",
            StatusCallbackMethod: "POST",
          }),
        });

        const twilioData = await twilioRes.json();
        if (!twilioRes.ok) {
          throw new Error(`Twilio error: ${twilioData.message || JSON.stringify(twilioData)}`);
        }

        // Create call record
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
            channel_provider: "twilio",
            external_call_id: twilioData.sid,
          })
          .select()
          .single();

        // Create active call
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

        // Update agent state
        await supabase
          .from("agent_telephony_state")
          .upsert({
            user_id: user.id,
            workspace_id,
            telephony_status: "on_call",
            current_call_id: activeCall?.id || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        result = { call: activeCall, twilio_sid: twilioData.sid };
        break;
      }

      case "end_call": {
        if (!call_id) throw new Error("call_id required");

        // Get the active call to find Twilio SID
        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .single();

        if (call?.sip_call_id) {
          // End call via Twilio
          const twilioRes = await fetch(`${twilioBase}/Calls/${call.sip_call_id}.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Status: "completed" }),
          });
          const twilioData = await twilioRes.json();
          if (!twilioRes.ok) {
            console.error("Twilio end call error:", twilioData);
          }
        }

        const now = new Date().toISOString();
        await supabase
          .from("active_calls")
          .update({ status: "completed", ended_at: now, updated_at: now })
          .eq("id", call_id);

        // Update call record with correct duration
        if (call?.call_record_id && call?.answered_at) {
          const duration = Math.floor(
            (new Date(now).getTime() - new Date(call.answered_at).getTime()) / 1000
          );
          await supabase
            .from("call_records")
            .update({ call_status: "completed", call_duration: duration, updated_at: now })
            .eq("id", call.call_record_id);
        }

        // Update agent state
        const { data: agentState } = await supabase
          .from("agent_telephony_state")
          .select("calls_handled_today")
          .eq("user_id", user.id)
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
          .single();

        if (call?.sip_call_id) {
          // Update Twilio call with hold TwiML
          const holdTwimlUrl = `${supabaseUrl}/functions/v1/twilio-twiml?type=hold&workspace_id=${workspace_id}`;
          await fetch(`${twilioBase}/Calls/${call.sip_call_id}.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Url: holdTwimlUrl, Method: "POST" }),
          });
        }

        await supabase
          .from("active_calls")
          .update({
            status: "on_hold",
            hold_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id);

        result = { held: true };
        break;
      }

      case "resume_call": {
        if (!call_id) throw new Error("call_id required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .single();

        if (call?.sip_call_id) {
          const resumeTwimlUrl = `${supabaseUrl}/functions/v1/twilio-twiml?type=outbound&workspace_id=${workspace_id}`;
          await fetch(`${twilioBase}/Calls/${call.sip_call_id}.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Url: resumeTwimlUrl, Method: "POST" }),
          });
        }

        const holdDuration = call?.hold_started_at
          ? Math.floor((Date.now() - new Date(call.hold_started_at).getTime()) / 1000)
          : 0;

        await supabase
          .from("active_calls")
          .update({
            status: "in_progress",
            hold_started_at: null,
            total_hold_seconds: (call?.total_hold_seconds || 0) + holdDuration,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id);

        result = { resumed: true };
        break;
      }

      case "transfer_call": {
        if (!call_id || !target_number) throw new Error("call_id and target_number required");

        const { data: call } = await supabase
          .from("active_calls")
          .select("*")
          .eq("id", call_id)
          .single();

        if (call?.sip_call_id) {
          // Cold transfer via Twilio - redirect to transfer TwiML
          const transferTwimlUrl = `${supabaseUrl}/functions/v1/twilio-twiml?type=transfer&target=${encodeURIComponent(target_number)}&workspace_id=${workspace_id}`;
          await fetch(`${twilioBase}/Calls/${call.sip_call_id}.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Url: transferTwimlUrl, Method: "POST" }),
          });
        }

        await supabase
          .from("active_calls")
          .update({
            status: "transferring",
            transfer_target: target_number,
            transferred_from: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call_id);

        // Release agent
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("telephony-call-manager error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
