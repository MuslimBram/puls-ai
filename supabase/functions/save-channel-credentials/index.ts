/**
 * save-channel-credentials
 *
 * Canonical server-side writer for channel credentials.
 * Secrets are encrypted before storage and are never returned to the client.
 * R111-C1: Explicit business binding validation and storage
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptForStorage } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { loadCallerRoles, staffRolesOf } from "../_shared/platform-roles.ts";
import { resolveGoverningWorkspace, resolvePlanKey } from "../_shared/plan-limits.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

const SECRET_EXACT_KEYS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "service_account_json",
  "private_key",
  "credentials",
]);

function normalizeCredentialKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isSensitiveCredentialKey(key: string): boolean {
  const normalized = normalizeCredentialKey(key);
  return SECRET_EXACT_KEYS.has(normalized)
    || normalized.endsWith("_token")
    || normalized.endsWith("_secret")
    || normalized.endsWith("_password")
    || normalized.endsWith("_private_key");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function encryptCredentialValue(value: string): Promise<string> {
  // Preserve already-encrypted values during an opportunistic legacy cleanup.
  return value.startsWith("enc:") ? value : await encryptForStorage(value);
}

async function partitionSettings(input: unknown): Promise<{
  safe: Record<string, unknown>;
  encrypted: Record<string, string>;
}> {
  const safe: Record<string, unknown> = {};
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(asRecord(input))) {
    if (value === undefined) continue;

    if (isSensitiveCredentialKey(key)) {
      if (value === null || value === "") continue;
      if (typeof value !== "string") {
        throw new Error(`Sensitive channel field '${key}' must be a string`);
      }
      encrypted[key] = await encryptCredentialValue(value);
      continue;
    }

    safe[key] = value;
  }

  return { safe, encrypted };
}

function encryptedStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (typeof item === "string" && item) result[key] = item;
  }
  return result;
}

/**
 * Transitional compatibility for older VoIP consumers that still read
 * settings.auth_token/api_key_secret. Only the already-encrypted `enc:` value
 * is copied; plaintext is never written here. Browser channel queries exclude
 * settings entirely. Remove this bridge after all VoIP readers use
 * credentials_encrypted in production.
 */
function addVoipCiphertextCompatibility(
  channelType: string,
  safeSettings: Record<string, unknown>,
  encryptedCredentials: Record<string, string>,
): Record<string, unknown> {
  if (channelType !== "voip" && channelType !== "voice") return safeSettings;

  const compatible = { ...safeSettings };
  if (encryptedCredentials.auth_token) {
    compatible.auth_token = encryptedCredentials.auth_token;
  }
  if (encryptedCredentials.api_key_secret) {
    compatible.api_key_secret = encryptedCredentials.api_key_secret;
  }
  return compatible;
}

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
      { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } },
    );
    if (res.ok) {
      const d = await res.json() as Record<string, unknown>;
      return { ok: true, detail: `Verified: ${String(d.friendly_name ?? accountSid)}` };
    }
    if (res.status === 401) return { ok: false, detail: "Invalid Account SID or Auth Token" };
    return { ok: false, detail: `Twilio returned ${res.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/** R111-C1: Validate business_id belongs to workspace and exists */
async function validateChannelEntitlement(
  sb: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
  channelType: string,
): Promise<{ valid: boolean; error?: string }> {
  const roles = await loadCallerRoles(sb, userId);
  if (staffRolesOf(roles).length > 0) return { valid: true };

  const { data: registry, error: registryError } = await sb
    .from("channel_registry")
    .select("id, is_available, integration_status, min_plan")
    .eq("id", channelType)
    .maybeSingle();

  if (registryError) return { valid: false, error: "Unable to validate channel entitlement" };
  if (!registry) return { valid: false, error: "Channel is not registered and cannot be connected" };
  if (registry.is_available !== true || registry.integration_status === "coming_soon") {
    return { valid: false, error: "This channel is not currently available" };
  }

  const governing = await resolveGoverningWorkspace(sb, userId, workspaceId);
  if (!governing) return { valid: false, error: "Forbidden: not a workspace member" };

  const { data: subscription, error: subscriptionError } = await sb
    .from("subscriptions")
    .select("plan, subscription_status, grace_period_end, trial_end")
    .eq("user_id", governing.ownerId)
    .maybeSingle();
  if (subscriptionError) return { valid: false, error: "Unable to validate subscription" };

  const currentPlan = resolvePlanKey(subscription);
  const { data: plans, error: plansError } = await sb
    .from("pricing_settings")
    .select("plan_key, sort_order, is_donation")
    .eq("is_donation", false)
    .order("sort_order", { ascending: true });
  if (plansError) return { valid: false, error: "Unable to validate plan catalogue" };

  const current = plans?.find((plan) => plan.plan_key === currentPlan);
  const required = plans?.find((plan) => plan.plan_key === registry.min_plan);
  if (!current || !required) return { valid: false, error: "Channel entitlement configuration is invalid" };
  if (Number(current.sort_order ?? -1) < Number(required.sort_order ?? -1)) {
    return { valid: false, error: "Channel " + channelType + " requires the " + registry.min_plan + " plan or higher" };
  }

  return { valid: true };
}

async function validateBusinessBinding(
  sb: ReturnType<typeof createClient>,
  businessId: string | null,
  workspaceId: string,
  isNewChannel: boolean,
): Promise<{ valid: boolean; error?: string }> {
  // For new channels, business_id must be provided and valid
  if (isNewChannel && !businessId) {
    return { valid: false, error: "business_id required for new channel binding" };
  }

  // If businessId provided, validate it exists and belongs to workspace
  if (businessId) {
    const { data: business, error: businessError } = await sb
      .from("business_profiles")
      .select("id, workspace_id")
      .eq("id", businessId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (businessError || !business) {
      return { valid: false, error: "business_id does not exist or belongs to a different workspace" };
    }
  }

  return { valid: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: userError } = await sb.auth.getUser(auth.slice(7));
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = asRecord(await req.json());
    const action = String(body.action ?? "save");
    const workspaceId = String(body.workspace_id ?? user.id).trim();

    if (!workspaceId) return json(req, { error: "workspace_id required" }, 400);

    // Every write/status/revoke operation is workspace-authorized server-side.
    const [{ data: member }, { data: owned }] = await Promise.all([
      sb.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) {
      return json(req, { error: "Forbidden: not a workspace member" }, 403);
    }

    // ── GENERIC CHANNEL SAVE ──────────────────────────────────────────────
    // Used by the browser-facing channel setup flows. The server, not the
    // browser, decides which fields are sensitive.
    if (action === "save_generic") {
      if (!body.workspace_id) return json(req, { error: "workspace_id required" }, 400);

      const channelType = String(body.channel_type ?? "").trim();
      const channelName = String(body.channel_name ?? channelType).trim();
      const entitlement = await validateChannelEntitlement(sb, user.id, workspaceId, channelType);
      if (!entitlement.valid) return json(req, { error: entitlement.error }, 403);
      if (!channelType) return json(req, { error: "channel_type required" }, 400);
      if (!channelName) return json(req, { error: "channel_name required" }, 400);

      const incoming = await partitionSettings(body.settings);

      const { data: existing, error: existingError } = await sb
        .from("channels")
        .select("id,settings,credentials_encrypted,business_id")
        .eq("workspace_id", workspaceId)
        .eq("channel_type", channelType)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      const isNewChannel = !existing?.id;

      // ── R111-C1: BUSINESS BINDING VALIDATION ──────────────────────────────
      const businessId = body.business_id ? String(body.business_id).trim() : null;
      const businessValidation = await validateBusinessBinding(sb, businessId, workspaceId, isNewChannel);
      if (!businessValidation.valid) {
        return json(req, { error: businessValidation.error }, 400);
      }

      // Opportunistically clean legacy rows whenever a channel is re-saved:
      // sensitive top-level keys formerly stored in settings are moved into the
      // encrypted credential bag, without double-encrypting enc: values.
      const legacy = await partitionSettings(existing?.settings);
      const existingEncrypted = encryptedStringRecord(existing?.credentials_encrypted);
      const safeSettings = { ...legacy.safe, ...incoming.safe };
      const encryptedCredentials = {
        ...existingEncrypted,
        ...legacy.encrypted,
        ...incoming.encrypted,
      };
      const storageSettings = addVoipCiphertextCompatibility(
        channelType,
        safeSettings,
        encryptedCredentials,
      );

      const common = {
        channel_name: channelName,
        channel_type: channelType,
        workspace_id: workspaceId,
        business_id: businessId, // R111-C1: Explicit business binding
        is_enabled: true,
        connection_status: "connected",
        last_error: null,
        connection_mode: body.connection_mode ?? "professional",
        account_type: body.account_type ?? "unknown",
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
        provider_metadata: asRecord(body.provider_metadata),
        settings: storageSettings,
        credentials_encrypted: encryptedCredentials,
        updated_at: new Date().toISOString(),
      };

      let channelId: string;
      if (existing?.id) {
        const { data: updated, error } = await sb
          .from("channels")
          .update(common)
          .eq("id", existing.id)
          .eq("workspace_id", workspaceId)
          .select("id")
          .single();
        if (error || !updated) throw error || new Error("Failed to update channel");
        channelId = updated.id;
      } else {
        const { data: created, error } = await sb
          .from("channels")
          .insert({ ...common, user_id: user.id })
          .select("id")
          .single();
        if (error || !created) throw error || new Error("Failed to create channel");
        channelId = created.id;
      }

      return json(req, {
        ok: true,
        channel_id: channelId,
        configured_credential_keys: Object.keys(encryptedCredentials).sort(),
      });
    }

    // ── TWILIO / VOIP SAVE ────────────────────────────────────────────────
    if (action === "save") {
      const provider = String(body.provider ?? "twilio");
      const accountSid = String(body.account_sid ?? "").trim();
      const authToken = String(body.auth_token ?? "").trim();
      const phoneNumber = body.phone_number ? String(body.phone_number) : null;
      const twimlAppSid = body.twiml_app_sid ? String(body.twiml_app_sid) : null;
      const apiKeySid = body.api_key_sid ? String(body.api_key_sid) : null;
      const apiKeySecret = body.api_key_secret ? String(body.api_key_secret) : null;
      const channelType = String(body.channel_type ?? "voip");

      if (!accountSid || !authToken) {
        return json(req, { error: "account_sid and auth_token required" }, 400);
      }

      const verification = await verifyTwilioCredentials(accountSid, authToken);
      if (!verification.ok) {
        return json(req, {
          error: "Credential verification failed",
          detail: verification.detail,
          verified: false,
        }, 400);
      }

      const encryptedCredentials: Record<string, string> = {
        auth_token: await encryptCredentialValue(authToken),
      };
      if (apiKeySecret) {
        encryptedCredentials.api_key_secret = await encryptCredentialValue(apiKeySecret);
      }

      const safeSettings: Record<string, unknown> = { provider, account_sid: accountSid };
      if (phoneNumber) safeSettings.phone_number = phoneNumber;
      if (twimlAppSid) safeSettings.twiml_app_sid = twimlAppSid;
      if (apiKeySid) safeSettings.api_key_sid = apiKeySid;
      const settings = addVoipCiphertextCompatibility(
        channelType,
        safeSettings,
        encryptedCredentials,
      );

      const { data: existing } = await sb.from("channels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("channel_type", channelType)
        .limit(1)
        .maybeSingle();

      const isNewChannel = !existing?.id;

      // ── R111-C1: BUSINESS BINDING VALIDATION FOR TWILIO ──────────────────
      const businessId = body.business_id ? String(body.business_id).trim() : null;
      const businessValidation = await validateBusinessBinding(sb, businessId, workspaceId, isNewChannel);
      if (!businessValidation.valid) {
        return json(req, { error: businessValidation.error }, 400);
      }

      let channelId: string;
      if (existing?.id) {
        const { data: updated, error } = await sb.from("channels")
          .update({
            is_enabled: true,
            connection_status: "connected",
            business_id: businessId, // R111-C1: Update business binding
            settings,
            credentials_encrypted: encryptedCredentials,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("workspace_id", workspaceId)
          .select("id")
          .single();
        if (error || !updated) throw error || new Error("Failed to update channel");
        channelId = updated.id;
      } else {
        const { data: created, error } = await sb.from("channels")
          .insert({
            user_id: user.id,
            workspace_id: workspaceId,
            business_id: businessId, // R111-C1: Explicit business binding
            channel_type: channelType,
            channel_name: provider === "twilio" ? "Twilio" : provider,
            is_enabled: true,
            connection_status: "connected",
            settings,
            credentials_encrypted: encryptedCredentials,
          })
          .select("id")
          .single();
        if (error || !created) throw error || new Error("Failed to create channel");
        channelId = created.id;
      }

      return json(req, {
        ok: true,
        verified: true,
        verification_detail: verification.detail,
        channel_id: channelId,
        masked: {
          account_sid: accountSid,
          auth_token: maskSecret(authToken),
          phone_number: phoneNumber,
          api_key_sid: apiKeySid,
          api_key_secret: apiKeySecret ? maskSecret(apiKeySecret) : null,
          twiml_app_sid: twimlAppSid,
        },
      });
    }

    // ── STATUS ─────────────────────────────────────────────────────────────
    if (action === "status") {
      const channelType = String(body.channel_type ?? "voip");
      const { data: channel } = await sb.from("channels")
        .select("id,connection_status,is_enabled,settings,credentials_encrypted,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("channel_type", channelType)
        .maybeSingle();

      if (!channel) return json(req, { configured: false });

      const settings = asRecord(channel.settings);
      const credentials = encryptedStringRecord(channel.credentials_encrypted);
      const legacyAuthToken = typeof settings.auth_token === "string" ? settings.auth_token : "";
      const legacyApiKeySecret = typeof settings.api_key_secret === "string" ? settings.api_key_secret : "";

      return json(req, {
        configured: true,
        connection_status: channel.connection_status,
        is_enabled: channel.is_enabled,
        updated_at: channel.updated_at,
        masked: {
          account_sid: settings.account_sid ?? null,
          auth_token: credentials.auth_token || legacyAuthToken ? "••••••••" : null,
          phone_number: settings.phone_number ?? null,
          api_key_sid: settings.api_key_sid ?? null,
          api_key_secret: credentials.api_key_secret || legacyApiKeySecret ? "••••••••" : null,
          twiml_app_sid: settings.twiml_app_sid ?? null,
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
          credentials_encrypted: {},
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("channel_type", String(body.channel_type ?? "voip"));

      return json(req, { ok: true, revoked: true });
    }

    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("[SAVE-CHANNEL-CREDENTIALS]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
