import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      .in("role", ["admin", "super_admin", "business_owner"]);

    if (roleError) throw roleError;
    if (!roleRows || roleRows.length === 0) {
      return json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    if (listSchema.safeParse(body).success) {
      const { data, error } = await supabaseAdmin
        .from("media_provider_credentials")
        .select("provider_key, credential_type, credential_label, secret_hint, is_valid, last_validated_at, last_validation_error, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      return json({
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
      return json({ success: true });
    }

    const parsedUpsert = upsertSchema.safeParse(body);
    if (!parsedUpsert.success) {
      return json({ error: parsedUpsert.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    const providerKey = parsedUpsert.data.providerKey;
    const { data: provider, error: providerError } = await supabaseAdmin
      .from("media_provider_settings")
      .select("provider_key, provider_name, config")
      .eq("provider_key", providerKey)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider) {
      return json({ error: `Provider ${providerKey} does not exist` }, { status: 404 });
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

    return json({
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
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
});

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
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
  const rootSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
