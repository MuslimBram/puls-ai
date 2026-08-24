import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { getServiceKey } from "../_shared/admin-client.ts";

type SignedRequestPayload = {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function decodeBase64Url(value: string): Uint8Array {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodePayload(value: string): SignedRequestPayload {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as SignedRequestPayload;
}

async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<SignedRequestPayload> {
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Malformed signed_request");

  const [signaturePart, payloadPart] = parts;
  const payload = decodePayload(payloadPart);
  if (String(payload.algorithm || "").toUpperCase() !== "HMAC-SHA256") {
    throw new Error("Unsupported signed_request algorithm");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(signaturePart),
    new TextEncoder().encode(payloadPart),
  );
  if (!valid) throw new Error("Invalid signed_request signature");
  if (!payload.user_id) throw new Error("signed_request is missing user_id");

  return payload;
}

async function readSignedRequest(req: Request): Promise<string> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    return String(body.signed_request || "").trim();
  }

  const form = await req.formData().catch(() => null);
  return String(form?.get("signed_request") || "").trim();
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret) return json({ error: "Meta deauthorization is not configured" }, 503);

  try {
    const signedRequest = await readSignedRequest(req);
    if (!signedRequest) return json({ error: "signed_request is required" }, 400);

    const payload = await verifySignedRequest(signedRequest, appSecret);
    const facebookUserId = String(payload.user_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!,
      { auth: { persistSession: false } },
    );

    const { data: channels, error: findError } = await supabase
      .from("channels")
      .select("id,provider_metadata")
      .eq("channel_type", "facebook")
      .contains("provider_metadata", { facebook_user_id: facebookUserId });
    if (findError) throw findError;

    let disconnected = 0;
    for (const channel of channels || []) {
      const providerMetadata = channel.provider_metadata && typeof channel.provider_metadata === "object"
        ? channel.provider_metadata as Record<string, unknown>
        : {};
      const { error: updateError } = await supabase
        .from("channels")
        .update({
          connection_status: "disconnected",
          is_enabled: false,
          credentials_encrypted: {},
          last_error: "Facebook authorization removed by Meta user",
          provider_metadata: {
            ...providerMetadata,
            deauthorized_at: new Date().toISOString(),
            deauthorized_by: "meta_signed_request",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", channel.id)
        .eq("channel_type", "facebook");
      if (updateError) throw updateError;
      disconnected += 1;
    }

    // Facebook Login account data is not destructively removed here because a user
    // may have additional login identities and workspace ownership. Full data deletion
    // follows the public, verified deletion-request flow at /data-deletion.html.
    return json({ ok: true, disconnected_channels: disconnected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signed_request";
    console.error("[META-DEAUTHORIZE]", message);
    const status = message.includes("signature") || message.includes("algorithm") || message.includes("Malformed") ? 401 : 400;
    return json({ error: message }, status);
  }
});
