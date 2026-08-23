import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { isInternalServiceRequest } from "../_shared/ai3-executor-contract.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

function asStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

/**
 * Send SMS via Twilio REST API.
 * Secrets are resolved server-side from channels.credentials_encrypted.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const serviceKey = getServiceKey()!;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const body = await req.json();
    const {
      to,
      body: messageBody,
      workspace_id,
      user_id: requestedUserId,
      from: fromOverride,
    } = body;

    if (!to || !messageBody) return json(req, { error: "to and body required" }, 400);

    const workspaceId = String(workspace_id ?? "").trim();
    if (!workspaceId) return json(req, { error: "workspace_id required" }, 400);

    const isInternal = isInternalServiceRequest({
      authHeader: auth,
      internalSecretHeader: req.headers.get("x-internal-secret"),
      serviceRoleKey: serviceKey,
      internalSecret: Deno.env.get("INTERNAL_WEBHOOK_SECRET"),
    });

    let userId: string;

    if (isInternal) {
      userId = typeof requestedUserId === "string" ? requestedUserId.trim() : "";
      if (!userId) {
        return json(req, { error: "user_id required for internal SMS send" }, 400);
      }
    } else {
      if (!auth.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
      const { data: { user }, error: userError } = await sb.auth.getUser(auth.slice(7));
      if (userError || !user) return json(req, { error: "Unauthorized" }, 401);
      userId = user.id;
    }

    // Every SMS send must be bound to a user/workspace relationship before
    // service-role credential material is read, including trusted internal calls.
    const [{ data: isMember }, { data: isOwned }] = await Promise.all([
      sb.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
      sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
    ]);
    if (!isMember && !isOwned) {
      return json(req, { error: "Forbidden: user is not a member of this workspace" }, 403);
    }

    const { data: channel } = await sb
      .from("channels")
      .select("settings,credentials_encrypted")
      .eq("workspace_id", workspaceId)
      .eq("channel_type", "sms")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!channel) {
      return json(req, { error: "No active SMS channel configured for this workspace" }, 503);
    }

    const settings = asStringRecord(channel.settings);
    const credentials = asStringRecord(channel.credentials_encrypted);
    const accountSid = settings.account_sid || "";
    const authTokenRaw = credentials.auth_token
      || settings.auth_token // temporary legacy-row fallback
      || "";
    const fromNumber = fromOverride ?? settings.phone_number ?? "";

    if (!accountSid || !authTokenRaw || !fromNumber) {
      return json(req, {
        error: "Workspace SMS credentials are incomplete. Reconnect the SMS channel.",
        missing: {
          account_sid: !accountSid,
          auth_token: !authTokenRaw,
          phone_number: !fromNumber,
        },
      }, 503);
    }

    const authToken = await decryptIfNeeded(authTokenRaw);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: messageBody }).toString(),
    });

    const twilioData = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      console.error("[send-sms] Twilio error", twilioData);
      return json(req, {
        error: `Twilio error: ${(twilioData as any).message ?? response.status}`,
        code: (twilioData as any).code,
      }, 400);
    }

    await sb.from("inbox_messages").insert({
      user_id: userId,
      workspace_id: workspaceId,
      channel_type: "sms",
      source_name: "SMS",
      sender_name: fromNumber,
      sender_identifier: fromNumber,
      message_content: messageBody,
      message_timestamp: new Date().toISOString(),
      direction: "outbound",
      status: "sent",
      delivery_status: "sent",
      provider_message_id: twilioData.sid as string,
    }).catch(() => {});

    return json(req, {
      success: true,
      message_sid: twilioData.sid,
      to,
      status: twilioData.status,
    });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
