import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

/** Validate the active workspace's WhatsApp Business connection and optionally send one explicit test message. */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id ?? "").trim();
    const channelId = body.channel_id ? String(body.channel_id) : null;
    const to = body.to ? String(body.to) : null;
    const testMessage = body.test_message ? String(body.test_message) : "✅ Pulse AI WhatsApp connection test successful.";
    if (!workspaceId) return json(req, { error: "workspace_id is required" }, 400);

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    let q = supabase.from("channels")
      .select("id,channel_name,is_enabled,connection_status,settings,credentials_encrypted")
      .eq("workspace_id", workspaceId)
      .eq("channel_type", "whatsapp");
    if (channelId) q = q.eq("id", channelId);
    const { data: channels, error: channelError } = await q;
    if (channelError) throw channelError;

    if (!channels?.length) {
      return json(req, {
        ok: false,
        checks: { channel_exists: false },
        message: "No WhatsApp channel configured in this workspace.",
      });
    }

    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
    const results: any[] = [];

    for (const ch of channels) {
      const settings = asRecord(ch.settings);
      const credentials = asRecord(ch.credentials_encrypted);
      const phoneNumberId = settings.phone_number_id || settings.waba_phone_number_id;
      const storedToken = credentials.access_token || settings.access_token;
      const checks: any = {
        channel_exists: true,
        channel_enabled: ch.is_enabled === true,
        connection_status_connected: ch.connection_status === "connected",
        has_phone_number_id: !!phoneNumberId,
        has_access_token: !!storedToken,
        meta_verified: false,
        test_send: null,
      };
      let detail = "";

      let accessToken = "";
      if (phoneNumberId && typeof storedToken === "string" && storedToken) {
        try {
          accessToken = await decryptIfNeeded(storedToken);
          const r = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const data = await r.json() as Record<string, any>;
          if (r.ok && data.id) {
            checks.meta_verified = true;
            detail = `Verified phone: ${data.display_phone_number || data.id}`;
          } else {
            detail = data?.error?.message || "Meta verification failed";
          }
        } catch (error) {
          detail = `Verification error: ${error instanceof Error ? error.message : "Unknown"}`;
        }
      } else {
        detail = "Missing encrypted access token or phone_number_id";
      }

      if (to && checks.meta_verified && accessToken) {
        try {
          const sendRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to,
              type: "text",
              text: { body: testMessage },
            }),
          });
          const sendData = await sendRes.json() as Record<string, any>;
          checks.test_send = {
            ok: sendRes.ok,
            message_id: sendData.messages?.[0]?.id ?? null,
            error: sendData?.error?.message ?? null,
          };
        } catch (error) {
          checks.test_send = { ok: false, error: error instanceof Error ? error.message : "Unknown" };
        }
      }

      results.push({
        channel_id: ch.id,
        channel_name: ch.channel_name,
        ok: checks.channel_enabled && checks.meta_verified,
        checks,
        detail,
      });
    }

    return json(req, { ok: results.every((r) => r.ok), workspace_id: workspaceId, results });
  } catch (error) {
    console.error("[VALIDATE-WHATSAPP]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
