import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.25.76";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const providerKeySchema = z.string().trim().min(2).max(100).regex(/^[a-z0-9-_]+$/i, "Invalid provider key");
const upsertSchema = z.object({
  action: z.literal("upsert"),
  providerKey: providerKeySchema,
  secret: z.string().trim().min(8).max(500),
  credentialLabel: z.string().trim().max(100).nullable().optional(),
  credentialType: z.string().trim().min(2).max(50).optional(),
});
const deleteSchema = z.object({
  action: z.literal("delete"),
  providerKey: providerKeySchema,
});
const listSchema = z.object({
  action: z.literal("list"),
});
const listSettingsSchema = z.object({
  action: z.literal("list_settings"),
});
const apiSecretNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]+$/, "api_secret_name must be an environment secret name")
  .nullable()
  .optional();
const upsertSettingSchema = z.object({
  action: z.literal("upsert_setting"),
  provider_key: providerKeySchema,
  provider_name: z.string().trim().min(2).max(160),
  media_types: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  is_enabled: z.boolean(),
  is_mock: z.boolean(),
  api_secret_name: apiSecretNameSchema,
  priority: z.number().int().min(0).max(10000),
  config: z.record(z.unknown()),
});
const sensitiveConfigKey = /(token|secret|password|api[_-]?key|private[_-]?key|credential)/i;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  getServiceKey() ?? "",
  { auth: { persistSession: false } },
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Not authenticated");

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "super_admin"]);

    if (roleError) throw roleError;
    if (!roleRows || roleRows.length === 0) {
      return json(req, { error: "Platform admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    if (listSettingsSchema.safeParse(body).success) {
      const { data, error } = await supabaseAdmin
        .from("media_provider_settings")
        .select("id, provider_key, provider_name, media_types, is_enabled, is_mock, api_secret_name, config, priority, created_at, updated_at, updated_by")
        .order("priority", { ascending: true })
        .order("provider_name", { ascending: true });

      if (error) throw error;
      return json(req, { settings: data ?? [] });
    }

    const parsedSetting = upsertSettingSchema.safeParse(body);
    if (parsedSetting.success) {
      if (containsSensitiveConfigKey(parsedSetting.data.config)) {
        return json(req, { error: "Provider config must not contain credential or secret values" }, { status: 400 });
      }

      const { action: _action, ...setting } = parsedSetting.data;
      const { data, error } = await supabaseAdmin
        .from("media_provider_settings")
        .upsert(
          {
            ...setting,
            updated_by: authData.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_key" },
        )
        .select("id, provider_key, provider_name, media_types, is_enabled, is_mock, api_secret_name, config, priority, created_at, updated_at, updated_by")
        .single();

      if (error) throw error;
      return json(req, { success: true, setting: data });
    }

    if (listSchema.safeParse(body).success) {
      const { data, error } = await supabaseAdmin
        .from("media_provider_credentials")
        .select("provider_key, credential_type, credential_label, secret_hint, is_valid, last_validated_at, last_validation_error, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      return json(req, {
        credentials: (data ?? []).map((item) => ({
          providerKey: item.provider_key,
          credentialType: item.credential_type,
          credentialLabel: item.credential_label,
          secretHint: item.secret_hint,
          isValid: item.is_valid,
          lastValidatedAt: item.last_validated_at,
          lastValidationError: item.last_validation_error,
          updatedAt: item.updated_at,
        })),
      });
    }

    const parsedDelete = deleteSchema.safeParse(body);
    if (parsedDelete.success) {
      const { error } = await supabaseAdmin
        .from("media_provider_credentials")
        .delete()
        .eq("provider_key", parsedDelete.data.providerKey);

      if (error) throw error;
      return json(req, { success: true });
    }

    const parsedUpsert = upsertSchema.safeParse(body);
    if (!parsedUpsert.success) {
      return json(req, { error: parsedUpsert.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    const providerKey = parsedUpsert.data.providerKey;
    const { data: provider, error: providerError } = await supabaseAdmin
      .from("media_provider_settings")
      .select("provider_key, provider_name, config")
      .eq("provider_key", providerKey)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider) {
      return json(req, { error: `Provider ${providerKey} does not exist` }, { status: 404 });
    }

    const validation = await validateCredential(provider, parsedUpsert.data.secret);
    const encryptedSecret = await encryptSecret(parsedUpsert.data.secret);

    const payload = {
      provider_key: providerKey,
      credential_type: parsedUpsert.data.credentialType ?? "api_key",
      credential_label: parsedUpsert.data.credentialLabel ?? null,
      encrypted_secret: encryptedSecret,
      secret_hint: buildSecretHint(parsedUpsert.data.secret),
      is_valid: validation.isValid,
      last_validated_at: new Date().toISOString(),
      last_validation_error: validation.message,
      updated_at: new Date().toISOString(),
      updated_by: authData.user.id,
    };

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("media_provider_credentials")
      .upsert(payload, { onConflict: "provider_key" })
      .select("provider_key, credential_type, credential_label, secret_hint, is_valid, last_validated_at, last_validation_error, updated_at")
      .single();

    if (saveError) throw saveError;

    return json(req, {
      success: true,
      validationMessage: validation.message,
      credential: {
        providerKey: saved.provider_key,
        credentialType: saved.credential_type,
        credentialLabel: saved.credential_label,
        secretHint: saved.secret_hint,
        isValid: saved.is_valid,
        lastValidatedAt: saved.last_validated_at,
        lastValidationError: saved.last_validation_error,
        updatedAt: saved.updated_at,
      },
    });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
});

function containsSensitiveConfigKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveConfigKey);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveConfigKey.test(key)) return true;
    if (containsSensitiveConfigKey(child)) return true;
  }
  return false;
}

function json(req: Request, body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...getCors(req),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function validateCredential(provider: { provider_key: string; config: unknown }, secret: string) {
  const config = toRecord(provider.config);
  const adapter = String(config.adapter ?? provider.provider_key);

  if (adapter === "replicate" || provider.provider_key === "replicate-video") {
    const response = await fetch("https://api.replicate.com/v1/models", {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      await response.text();
      return { isValid: true, message: "Credential validated against Replicate." };
    }

    const body = await response.text();
    return {
      isValid: false,
      message: `Replicate validation failed [${response.status}]${body ? `: ${body.slice(0, 180)}` : ""}`,
    };
  }

  return {
    isValid: true,
    message: "Credential stored securely. No provider-specific validator is configured yet.",
  };
}

async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(secret));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(payload: string) {
  const [ivBase64, encryptedBase64] = payload.split(".");
  if (!ivBase64 || !encryptedBase64) throw new Error("Invalid encrypted secret format");

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(encryptedBase64),
  );

  return textDecoder.decode(decrypted);
}

async function getEncryptionKey() {
  const rootSecret = getServiceKey();
  if (!rootSecret) throw new Error("Service role key is not configured");

  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(rootSecret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function buildSecretHint(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}
