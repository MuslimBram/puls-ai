import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

/**
 * Validate WhatsApp Business channel end-to-end.
 *
 * Runs 4 checks for the user's WhatsApp channel(s):
 *  1. Channel row exists and is enabled
 *  2. Credentials present (phone_number_id + access_token)
 *  3. Live verification with Meta Graph API (/me)
 *  4. Optional: send a test text message if `to` is provided
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: aErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (aErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { channel_id, to, test_message } = body;

    let q = supabase.from("channels").select("id, channel_name, is_enabled, settings").eq("user_id", user.id).eq("channel_type", "whatsapp");
    if (channel_id) q = q.eq("id", channel_id);
    const { data: channels } = await q;

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        checks: { channel_exists: false },
        message: "No WhatsApp channel configured. Connect WhatsApp first via Channels → Add WhatsApp Business.",
      }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    const results: any[] = [];
    for (const ch of channels) {
      const settings = (ch.settings as any) || {};
      const checks: any = {
        channel_exists: true,
        channel_enabled: ch.is_enabled === true,
        has_phone_number_id: !!settings.phone_number_id,
        has_access_token: !!settings.access_token,
        meta_verified: false,
        test_send: null,
      };
      let detail = "";

      if (checks.has_phone_number_id && checks.has_access_token) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v19.0/${settings.phone_number_id}?access_token=${settings.access_token}`,
          );
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
        detail = "Missing access_token or phone_number_id in channel settings";
      }

      // Optional test send
      if (to && checks.meta_verified) {
        try {
          const sendRes = await fetch(
            `https://graph.facebook.com/v19.0/${settings.phone_number_id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${settings.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: test_message || "✅ Pulse AI WhatsApp connection test successful." },
              }),
            },
          );
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

    return new Response(JSON.stringify({
      ok: results.every((r) => r.ok),
      results,
    }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("validate-whatsapp-connection error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
