import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptForStorage } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

async function verifyBotToken(botToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || !data.ok || !data.result?.id) {
    throw new Error(String(data.description || `Telegram verification failed [${response.status}]`));
  }
  return data.result as { id: number; username?: string; first_name?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = getServiceKey() || "";
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
  if (!supabaseUrl || !serviceKey) return json(req, { error: "Supabase configuration missing" }, 503);

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const token = authorization.slice(7).trim();
    const { data: { user }, error: userError } = await sb.auth.getUser(token);
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json();
    const action = String(body.action || "save");
    const workspaceId = String(body.workspace_id || "").trim();
    const botToken = String(body.bot_token || "").trim();
    const requestedName = String(body.channel_name || "").trim();

    if (!workspaceId) return json(req, { error: "workspace_id required" }, 400);
    if (!botToken) return json(req, { error: "bot_token required" }, 400);

    const [{ data: member }, { data: owned }] = await Promise.all([
      sb.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    const bot = await verifyBotToken(botToken);
    const botUsername = bot.username ? `@${bot.username}` : null;

    if (action === "verify") {
      return json(req, {
        ok: true,
        verified: true,
        bot_id: bot.id,
        bot_username: botUsername,
        bot_name: bot.first_name || bot.username || "Telegram Bot",
      });
    }

    if (action !== "save") return json(req, { error: `Unknown action: ${action}` }, 400);
    if (!webhookSecret) {
      return json(req, { error: "TELEGRAM_WEBHOOK_SECRET not configured" }, 503);
    }

    const encryptedBotToken = await encryptForStorage(botToken);

    const { data: existing } = await sb
      .from("channels")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel_type", "telegram")
      .limit(1)
      .maybeSingle();

    const safeSettings = {
      bot_token_configured: true,
      bot_username: botUsername || "",
      bot_id: String(bot.id),
    };
    const encryptedCredentials = { bot_token: encryptedBotToken };

    let channelId: string;
    if (existing?.id) {
      const { data: updated, error } = await sb
        .from("channels")
        .update({
          channel_name: requestedName || botUsername || bot.first_name || "Telegram",
          is_enabled: true,
          connection_status: "connecting",
          settings: safeSettings,
          credentials_encrypted: encryptedCredentials,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .single();
      if (error || !updated) throw error || new Error("Failed to update Telegram channel");
      channelId = updated.id;
    } else {
      const { data: created, error } = await sb
        .from("channels")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          channel_type: "telegram",
          channel_name: requestedName || botUsername || bot.first_name || "Telegram",
          connection_mode: "professional",
          account_type: "business",
          is_enabled: true,
          connection_status: "connecting",
          settings: safeSettings,
          credentials_encrypted: encryptedCredentials,
        })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Failed to create Telegram channel");
      channelId = created.id;
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?channel_id=${encodeURIComponent(channelId)}`;
    const setWebhookResponse = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false,
      }),
    });
    const webhookData = await setWebhookResponse.json().catch(() => ({})) as Record<string, any>;

    if (!setWebhookResponse.ok || !webhookData.ok) {
      await sb.from("channels").update({
        connection_status: "error",
        last_error: String(webhookData.description || `Telegram setWebhook failed [${setWebhookResponse.status}]`),
      }).eq("id", channelId);
      return json(req, {
        error: String(webhookData.description || "Telegram webhook configuration failed"),
        channel_id: channelId,
      }, 502);
    }

    await sb.from("channels").update({
      connection_status: "connected",
      last_error: null,
      settings: { ...safeSettings, webhook_url: webhookUrl },
      updated_at: new Date().toISOString(),
    }).eq("id", channelId);

    return json(req, {
      ok: true,
      verified: true,
      channel_id: channelId,
      bot_username: botUsername,
      webhook_configured: true,
    });
  } catch (error) {
    console.error("[SAVE-TELEGRAM-CREDENTIALS]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
