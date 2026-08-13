import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...getCors(req), "Content-Type": "application/json" },
  });

/**
 * Send SMS via Twilio REST API (direct, no third-party gateway).
 * Credentials retrieved server-side from encrypted channel settings.
 * auth_token NEVER returned to client.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: ue } = await sb.auth.getUser(auth.slice(7));
    if (ue || !user) return json(req, { error: "Unauthorized" }, 401);

    const { to, body: messageBody, workspace_id, from: fromOverride } = await req.json();
    if (!to || !messageBody) return json(req, { error: "to and body required" }, 400);

    // ── Workspace membership enforcement ───────────────────────────────────
    // Reject cross-workspace use — user must be a member of the requested workspace
    const wsId = workspace_id ?? user.id;
    if (workspace_id && workspace_id !== user.id) {
      const { data: isMember } = await sb.rpc("is_workspace_member",
        { _user_id: user.id, _workspace_id: workspace_id });
      const { data: isOwned } = await sb.from("workspaces")
        .select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle();
      if (!isMember && !isOwned) {
        return json(req, { error: "Forbidden: not a member of this workspace" }, 403);
      }
    }

    // ── Resolve workspace credentials ─────────────────────────────────────
    const { data: ch } = await sb
      .from("channels")
      .select("settings")
      .eq("workspace_id", wsId)
      .eq("channel_type", "sms")
      .eq("is_enabled", true)
      .maybeSingle();

    // Fall back to environment-level Twilio credentials
    const settings = (ch?.settings as Record<string, string>) ?? {};
    const accountSid  = settings.account_sid ?? Deno.env.get("TWILIO_ACCOUNT_SID");
    const authTokenRaw = settings.auth_token  ?? Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber   = fromOverride ?? settings.phone_number ?? Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authTokenRaw || !fromNumber) {
      return json(req, {
        error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.",
        missing: {
          account_sid:   !accountSid,
          auth_token:    !authTokenRaw,
          phone_number:  !fromNumber,
        },
      }, 503);
    }

    // Decrypt if stored encrypted (uses TOKEN_ENCRYPTION_KEY)
    const authToken = await decryptIfNeeded(authTokenRaw);

    // ── Direct Twilio REST API ────────────────────────────────────────────
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: messageBody }).toString(),
    });

    const twilioData = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error("[send-sms] Twilio error", twilioData);
      return json(req, {
        error: `Twilio error: ${(twilioData as any).message ?? res.status}`,
        code:  (twilioData as any).code,
      }, 400);
    }

    // Log outbound message (no auth_token in log)
    await sb.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id: wsId,
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
  } catch (e: any) {
    return json(req, { error: e.message }, 500);
  }
});
