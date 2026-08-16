/**
 * save-channel-credentials
 *
 * Server-side only: encrypts Twilio/VoIP credentials before storage.
 * Frontend NEVER sends credentials to Twilio or stores plaintext secrets.
 * Returns only masked metadata (never raw secrets).
 *
 * Actions:
 *   save    — encrypt + store credentials; verify with Twilio API server-side
 *   status  — return masked metadata only (no secrets)
 *   revoke  — clear credentials
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptForStorage, decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...getCors(req), "Content-Type": "application/json" },
  });

/** Mask a secret for safe client display */
function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return s.slice(0, 2) + "•".repeat(Math.min(s.length - 4, 20)) + s.slice(-2);
}

/** Verify Twilio credentials server-side by calling Twilio API */
async function verifyTwilioCredentials(
  accountSid: string,
  authToken: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } }
    );
    if (res.ok) {
      const d = await res.json() as any;
      return { ok: true, detail: `Verified: ${d.friendly_name ?? accountSid}` };
    }
    if (res.status === 401) return { ok: false, detail: "Invalid Account SID or Auth Token" };
    return { ok: false, detail: `Twilio returned ${res.status}` };
  } catch (e: any) {
    return { ok: false, detail: `Verification failed: ${e.message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: ue } = await sb.auth.getUser(auth.slice(7));
    if (ue || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json();
    const action: string = body.action ?? "save";
    const workspaceId: string = body.workspace_id ?? user.id;

    // Workspace membership check
    const { data: member } = await sb.rpc("is_workspace_member",
      { _user_id: user.id, _workspace_id: workspaceId }).maybeSingle();
    // Fallback: user owns workspace if membership check not available
    const { data: owned } = await sb.from("workspaces")
      .select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle();
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    // ── SAVE ──────────────────────────────────────────────────────────────
    if (action === "save") {
      const {
        provider = "twilio",
        account_sid, auth_token, phone_number,
        twiml_app_sid, api_key_sid, api_key_secret,
        channel_type = "voip",
      } = body;

      if (!account_sid || !auth_token) {
        return json(req, { error: "account_sid and auth_token required" }, 400);
      }

      // VERIFY server-side BEFORE storing
      const verification = await verifyTwilioCredentials(account_sid, auth_token);
      if (!verification.ok) {
        return json(req, {
          error: "Credential verification failed",
          detail: verification.detail,
          verified: false,
        }, 400);
      }

      // Encrypt ALL secrets before storage
      const [encAuthToken, encApiKeySecret] = await Promise.all([
        encryptForStorage(auth_token),
        api_key_secret ? encryptForStorage(api_key_secret) : Promise.resolve(null),
      ]);

      const settings: Record<string, string | null> = {
        provider,
        account_sid,                          // SID is not a secret (safe to store plaintext)
        auth_token: encAuthToken,             // encrypted
        phone_number: phone_number ?? null,
        twiml_app_sid: twiml_app_sid ?? null, // not a secret
        api_key_sid: api_key_sid ?? null,     // not a secret
        api_key_secret: encApiKeySecret,      // encrypted
      };

      // Remove nulls
      Object.keys(settings).forEach(k => settings[k] === null && delete settings[k]);

      // Upsert channel
      const { data: ch, error: ce } = await sb.from("channels")
        .upsert({
          user_id: user.id,
          workspace_id: workspaceId,
          channel_type,
          is_enabled: true,
          connection_status: "connected",
          settings,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,channel_type" })
        .select("id").single();

      if (ce) throw ce;

      // Return ONLY masked metadata — never raw secrets
      return json(req, {
        ok: true,
        verified: true,
        verification_detail: verification.detail,
        channel_id: ch?.id,
        masked: {
          account_sid: account_sid,                    // SID is safe to show
          auth_token: maskSecret(auth_token),
          phone_number: phone_number ?? null,
          api_key_sid: api_key_sid ?? null,
          api_key_secret: api_key_secret ? maskSecret(api_key_secret) : null,
          twiml_app_sid: twiml_app_sid ?? null,
        },
      });
    }

    // ── STATUS ─────────────────────────────────────────────────────────────
    if (action === "status") {
      const { data: ch } = await sb.from("channels")
        .select("id,connection_status,is_enabled,settings,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("channel_type", body.channel_type ?? "voip")
        .maybeSingle();

      if (!ch) return json(req, { configured: false });

      const s = (ch.settings as Record<string, string>) ?? {};
      return json(req, {
        configured: true,
        connection_status: ch.connection_status,
        is_enabled: ch.is_enabled,
        updated_at: ch.updated_at,
        // NEVER return secrets — only safe fields + masked
        masked: {
          account_sid: s.account_sid ?? null,
          auth_token: s.auth_token ? "••••••••" : null,
          phone_number: s.phone_number ?? null,
          api_key_sid: s.api_key_sid ?? null,
          api_key_secret: s.api_key_secret ? "••••••••" : null,
          twiml_app_sid: s.twiml_app_sid ?? null,
        },
      });
    }

    // ── REVOKE ─────────────────────────────────────────────────────────────
    if (action === "revoke") {
      await sb.from("channels")
        .update({
          is_enabled: false,
          connection_status: "disconnected",
          settings: {},
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("channel_type", body.channel_type ?? "voip");

      return json(req, { ok: true, revoked: true });
    }

    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json(req, { error: e.message }, 500);
  }
});
