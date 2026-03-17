import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base32encode } from "https://deno.land/std@0.208.0/encoding/base32.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32encode(bytes);
}

function hotp(secret: Uint8Array, counter: bigint): string {
  // Simple HMAC-based OTP
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, counter);

  // Use Web Crypto for HMAC-SHA1
  return ""; // Placeholder - we'll use a simpler approach
}

async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  // Decode base32 secret
  const { decode: base32decode } = await import("https://deno.land/std@0.208.0/encoding/base32.ts");
  const keyBytes = base32decode(secret);

  const timeStep = 30;
  const now = Math.floor(Date.now() / 1000);

  // Check current and ±1 time steps
  for (const offset of [-1, 0, 1]) {
    const counter = Math.floor(now / timeStep) + offset;
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, counter);

    const key = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const hmac = await crypto.subtle.sign("HMAC", key, counterBytes);
    const hmacArray = new Uint8Array(hmac);

    const offset2 = hmacArray[hmacArray.length - 1] & 0x0f;
    const code = (
      ((hmacArray[offset2] & 0x7f) << 24) |
      ((hmacArray[offset2 + 1] & 0xff) << 16) |
      ((hmacArray[offset2 + 2] & 0xff) << 8) |
      (hmacArray[offset2 + 3] & 0xff)
    ) % 1000000;

    if (String(code).padStart(6, "0") === token) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(jwt);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string };

    const { action, token: totpToken } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "enroll") {
      // Generate new secret
      const secret = generateSecret();
      const issuer = "LeadPulse";
      const otpauthUrl = `otpauth://totp/${issuer}:${user.email}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;

      // Store (upsert) unverified secret
      await supabaseAdmin.from("totp_secrets").upsert({
        user_id: user.id,
        encrypted_secret: secret,
        is_verified: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ secret, otpauthUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!token || token.length !== 6) {
        return new Response(JSON.stringify({ error: "Invalid token format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: totpRow } = await supabaseAdmin
        .from("totp_secrets")
        .select("encrypted_secret")
        .eq("user_id", user.id)
        .single();

      if (!totpRow) {
        return new Response(JSON.stringify({ error: "No TOTP secret found. Enroll first." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyTOTP(totpRow.encrypted_secret, token);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid code. Try again." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as verified
      await supabaseAdmin.from("totp_secrets").update({
        is_verified: true,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const { data: totpRow } = await supabaseAdmin
        .from("totp_secrets")
        .select("is_verified, created_at")
        .eq("user_id", user.id)
        .single();

      return new Response(JSON.stringify({
        enrolled: !!totpRow,
        verified: totpRow?.is_verified ?? false,
        enrolledAt: totpRow?.created_at ?? null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disable") {
      if (!token || token.length !== 6) {
        return new Response(JSON.stringify({ error: "Provide current TOTP code to disable" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: totpRow } = await supabaseAdmin
        .from("totp_secrets")
        .select("encrypted_secret")
        .eq("user_id", user.id)
        .single();

      if (!totpRow) {
        return new Response(JSON.stringify({ error: "2FA not enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyTOTP(totpRow.encrypted_secret, token);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("totp_secrets").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ disabled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
