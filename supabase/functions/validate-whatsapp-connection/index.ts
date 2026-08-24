import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: aErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (aErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id || "");
    const { channel_id, to, test_message } = body;
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id is required" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) {
      return new Response(JSON.stringify({ error: "Forbidden: not a workspace member" }), {
        status: 403, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    let q = supabase
      .from("channels")
      .select("id, channel_name, is_enabled, settings, credentials_encrypted")
      .eq("workspace_id", workspaceId)
      .eq("channel_type", "whatsapp");
    if (channel_id) q = q.eq("id", channel_id);
    const { data: channels, error: channelError } = await q;
    if (channelError) throw channelError;

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        checks: { channel_exists: false },
        message: "No WhatsApp channel configured for this workspace.",
      }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    const results: any[] = [];
    for (const ch of channels) {
      const settings = (ch.settings as Record<string, any> | null) || {};
      const encrypted = (ch.credentials_encrypted as Record<string, any> | null) || {};
      const tokenValue = typeof encrypted.access_token === "string"
        ? encrypted.access_token
        : typeof settings.access_token === "string" ? settings.access_token : "";
      const phoneNumberId = String(settings.phone_number_id || settings.waba_phone_number_id || "");
      const accessToken = tokenValue ? await decryptIfNeeded(tokenValue) : "";

      const checks: any = {
        channel_exists: true,
        channel_enabled: ch.is_enabled === true,
        has_phone_number_id: !!phoneNumberId,
        has_access_token: !!tokenValue,
        credentials_encrypted: typeof encrypted.access_token === "string" && encrypted.access_token.startsWith("enc:"),
        meta_verified: false,
        test_send: null,
      };
      let detail = "";

      if (phoneNumberId && accessToken) {
        try {
          const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const d = await r.json();
          if (r.ok && d.id) {
            checks.meta_verified = true;
            detail = `Verified phone: ${d.display_phone_number || d.id}`;
          } else {
            detail = d?.error?.message || "Meta verification failed";
          }
        } catch (e) {
          detail = `Network error: ${(e as Error).message}`;
        }
      } else {
        detail = "Missing encrypted access token or phone number ID";
      }

      if (to && checks.meta_verified) {
        try {
          const sendRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to,
              type: "text",
              text: { body: test_message || "✅ Pulse AI WhatsApp connection test successful." },
            }),
          });
          const sendData = await sendRes.json();
          checks.test_send = {
            ok: sendRes.ok,
            message_id: sendData.messages?.[0]?.id,
            error: sendData?.error?.message,
          };
        } catch (e) {
          checks.test_send = { ok: false, error: (e as Error).message };
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

    return new Response(JSON.stringify({ ok: results.every((r) => r.ok), results }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-whatsapp-connection error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
