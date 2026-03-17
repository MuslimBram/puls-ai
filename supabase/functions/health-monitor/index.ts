import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all workspaces with connected channels
    const { data: channels } = await supabase
      .from("channels")
      .select("id, channel_type, channel_name, connection_status, workspace_id, user_id, settings")
      .eq("is_enabled", true);

    if (!channels?.length) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const ch of channels) {
      const start = Date.now();
      let status = "healthy";
      let errorMsg: string | null = null;

      // Check channel-specific health
      try {
        switch (ch.channel_type) {
          case "telegram": {
            const botToken = (ch.settings as any)?.bot_token;
            if (botToken) {
              const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
                signal: AbortSignal.timeout(8000),
              });
              if (!res.ok) { status = "degraded"; errorMsg = `Telegram API: ${res.status}`; }
              await res.text();
            } else {
              status = "unknown";
              errorMsg = "No bot token configured";
            }
            break;
          }
          case "whatsapp": {
            const phoneId = (ch.settings as any)?.phone_number_id;
            const token = (ch.settings as any)?.access_token;
            if (phoneId && token) {
              const res = await fetch(
                `https://graph.facebook.com/v18.0/${phoneId}`,
                { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
              );
              if (!res.ok) { status = "degraded"; errorMsg = `WhatsApp API: ${res.status}`; }
              await res.text();
            } else {
              status = "unknown";
              errorMsg = "Incomplete credentials";
            }
            break;
          }
          case "email": {
            // Basic IMAP connectivity check via settings presence
            const host = (ch.settings as any)?.imap_host;
            status = host ? "healthy" : "unknown";
            if (!host) errorMsg = "No IMAP host configured";
            break;
          }
          default:
            status = ch.connection_status === "connected" ? "healthy" : "unknown";
        }
      } catch (e) {
        status = "down";
        errorMsg = e.message;
      }

      const responseTime = Date.now() - start;

      // Insert health check
      await supabase.from("system_health_checks").insert({
        check_type: "channel_heartbeat",
        target_name: `${ch.channel_type}:${ch.channel_name}`,
        status,
        response_time_ms: responseTime,
        error_message: errorMsg,
        workspace_id: ch.workspace_id,
        metadata: { channel_id: ch.id },
      });

      // Update channel connection status
      if (status === "down" && ch.connection_status !== "disconnected") {
        await supabase
          .from("channels")
          .update({ connection_status: "error", updated_at: new Date().toISOString() })
          .eq("id", ch.id);
      }

      // Alert admin if channel is down
      if (status === "down") {
        await supabase.from("business_notifications").insert({
          user_id: ch.user_id,
          workspace_id: ch.workspace_id,
          title: `Channel Down: ${ch.channel_name}`,
          message: `${ch.channel_type} channel "${ch.channel_name}" is unreachable. Error: ${errorMsg}`,
          notification_type: "warning",
          category: "system",
        });
      }

      results.push({ channel: ch.channel_name, type: ch.channel_type, status, ms: responseTime });
    }

    return new Response(JSON.stringify({ checked: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
