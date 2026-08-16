import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

export interface SendDiscordPayload {
  workspace_id: string;
  message_content: string;
  channel_id?: string;
  reply_to_message_id?: string;
  embeds?: Record<string, unknown>[];
  mode?: "bot" | "webhook" | "auto";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized: Missing Bearer token" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

  let body: SendDiscordPayload;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON payload" }, 400);
  }

  // 1. WORKSPACE ISOLATION & VALIDATION (No user.id fallback!)
  const workspaceId = body.workspace_id;
  if (!workspaceId || typeof workspaceId !== "string" || workspaceId.trim() === "") {
    return json(req, { error: "workspace_id is required" }, 400);
  }

  if (!body.message_content || typeof body.message_content !== "string" || body.message_content.trim() === "") {
    return json(req, { error: "message_content is required" }, 400);
  }

  // 2. HARDENED WORKSPACE AUTHORIZATION (Before any external HTTP request)
  const { data: member } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: workspaceId,
  }).maybeSingle();

  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!member && !owned) {
    return json(req, { error: "Forbidden: Not authorized for this workspace" }, 403);
  }

  // 3. WORKSPACE-SCOPED CREDENTIAL RESOLUTION (Zero global fallback!)
  const { data: channel } = await supabase
    .from("channels")
    .select("credentials_encrypted, provider_metadata")
    .eq("workspace_id", workspaceId)
    .eq("channel_type", "discord")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (!channel) {
    return json(req, { error: "Discord integration not connected for this workspace" }, 400);
  }

  let decryptedCreds: Record<string, string> = {};
  if (channel.credentials_encrypted) {
    try {
      const rawCreds = await decryptIfNeeded(channel.credentials_encrypted);
      if (typeof rawCreds === "string" && rawCreds.startsWith("{")) {
        decryptedCreds = JSON.parse(rawCreds);
      } else if (typeof rawCreds === "string") {
        decryptedCreds = { bot_token: rawCreds };
      }
    } catch {
      /* invalid credentials format */
    }
  }

  const metadata = channel.provider_metadata || {};
  const botToken = decryptedCreds.bot_token ?? metadata.bot_token ?? null;
  const webhookUrl = decryptedCreds.webhook_url ?? metadata.webhook_url ?? null;
  const targetChannelId = body.channel_id ?? metadata.channel_id ?? null;
  const requestedMode = body.mode ?? (botToken && targetChannelId ? "bot" : webhookUrl ? "webhook" : "auto");

  if (requestedMode === "bot" && (!botToken || !targetChannelId)) {
    return json(req, { error: "Discord Bot mode requested but bot_token or channel_id is missing" }, 400);
  }
  if (requestedMode === "webhook" && !webhookUrl) {
    return json(req, { error: "Discord Webhook mode requested but webhook_url is missing" }, 400);
  }
  if (!botToken && !webhookUrl) {
    return json(req, { error: "No valid Discord credentials found for this workspace" }, 400);
  }

  // 4. DISCORD DISPATCH ENGINE
  const isBotMode = requestedMode === "bot" || (Boolean(botToken) && Boolean(targetChannelId));

  if (isBotMode && botToken && targetChannelId) {
    const url = `https://discord.com/api/v10/channels/${targetChannelId}/messages`;
    const discordPayload: Record<string, unknown> = {
      content: body.message_content,
      embeds: body.embeds,
    };

    if (body.reply_to_message_id) {
      discordPayload.message_reference = { message_id: body.reply_to_message_id };
    }

    const headers: Record<string, string> = {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      "User-Agent": "PulseAI (https://pulse.ai, v1.0)",
    };

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(discordPayload),
    });

    if (response.status === 429) {
      const rateLimitBody = await response.json().catch(() => ({}));
      const retryAfterSec = Number(
        response.headers.get("x-ratelimit-reset-after") ??
          response.headers.get("retry-after") ??
          rateLimitBody.retry_after ??
          1
      );

      const delayMs = Math.min(Math.ceil(retryAfterSec * 1000), 5000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(discordPayload),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return json(req, { error: `Discord Bot API Error (${response.status}): ${errText}` }, response.status);
    }

    const resData = await response.json();
    return json(req, {
      success: true,
      mode: "bot",
      message_id: resData.id,
      channel_id: resData.channel_id,
      guild_id: resData.guild_id,
    });
  } else if (webhookUrl) {
    const discordPayload: Record<string, unknown> = {
      content: body.message_content,
      username: metadata.username ?? "Pulse AI",
      embeds: body.embeds,
    };

    let response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (response.status === 429) {
      const rateLimitBody = await response.json().catch(() => ({}));
      const retryAfterSec = Number(
        response.headers.get("retry-after") ?? rateLimitBody.retry_after ?? 1
      );

      const delayMs = Math.min(Math.ceil(retryAfterSec * 1000), 5000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return json(req, { error: `Discord Webhook Error (${response.status}): ${errText}` }, response.status);
    }

    return json(req, {
      success: true,
      mode: "webhook",
      message_id: `wh-${Date.now()}`,
    });
  }

  return json(req, { error: "Failed to resolve valid Discord connection path" }, 400);
});
