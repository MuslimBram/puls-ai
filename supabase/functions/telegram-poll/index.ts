import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

Deno.serve(async (req) => {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) {
    return new Response(unauthorized.body, {
      status: unauthorized.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: channels, error } = await supabase
      .from("channels")
      .select("id, workspace_id, user_id, channel_name, credentials_encrypted, settings, connection_status")
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .limit(25);
    if (error) throw error;

    if (!channels?.length) {
      return new Response(JSON.stringify({
        ok: true,
        mode: "webhook",
        active_channels: 0,
        healthy: 0,
        needs_reconnect: 0,
      }), { headers: { "Content-Type": "application/json" } });
    }

    const checks: Array<Record<string, unknown>> = [];
    for (const channel of channels) {
      const credentials = (channel.credentials_encrypted || {}) as Record<string, unknown>;
      const encryptedToken = typeof credentials.bot_token === "string" ? credentials.bot_token : "";
      let botToken = "";
      try {
        botToken = encryptedToken ? await decryptIfNeeded(encryptedToken) : "";
      } catch (decryptError) {
        checks.push({
          channel_id: channel.id,
          workspace_id: channel.workspace_id,
          ok: false,
          status: "credential_error",
          error: decryptError instanceof Error ? decryptError.message : "Credential decrypt failed",
        });
        continue;
      }

      if (!botToken) {
        checks.push({
          channel_id: channel.id,
          workspace_id: channel.workspace_id,
          ok: false,
          status: "needs_reconnect",
        });
        continue;
      }

      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const data = await response.json().catch(() => ({})) as Record<string, any>;
        const webhook = data.result || {};
        const healthy = Boolean(response.ok && data.ok && webhook.url);

        checks.push({
          channel_id: channel.id,
          workspace_id: channel.workspace_id,
          ok: healthy,
          status: healthy ? "webhook_active" : "webhook_inactive",
          pending_update_count: Number(webhook.pending_update_count || 0),
          last_error_date: webhook.last_error_date || null,
          last_error_message: webhook.last_error_message || null,
        });

        if (healthy && channel.connection_status !== "connected") {
          await supabase.from("channels").update({
            connection_status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", channel.id);
        } else if (!healthy) {
          await supabase.from("channels").update({
            connection_status: "error",
            last_error: String(webhook.last_error_message || "Telegram webhook is not active"),
            updated_at: new Date().toISOString(),
          }).eq("id", channel.id);
        }
      } catch (checkError) {
        checks.push({
          channel_id: channel.id,
          workspace_id: channel.workspace_id,
          ok: false,
          status: "check_failed",
          error: checkError instanceof Error ? checkError.message : "Webhook health check failed",
        });
      }
    }

    const healthy = checks.filter((item) => item.ok === true).length;
    const needsReconnect = checks.filter((item) => item.status === "needs_reconnect").length;

    return new Response(JSON.stringify({
      ok: true,
      mode: "webhook",
      active_channels: channels.length,
      healthy,
      needs_reconnect: needsReconnect,
      checks,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[TELEGRAM-HEALTH]", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
