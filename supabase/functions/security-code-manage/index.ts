import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple hash for security code (not crypto-grade but sufficient for app-level 2FA)
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code + "pulsi_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validate format: 1 capital + 3 letters + 1 symbol + 1 punctuation + 3 digits
// Example: Aabc@.123
function validateCodeFormat(code: string): boolean {
  if (code.length < 9) return false;
  const regex = /^[A-Z][a-zA-Z]{3}[!@#$%^&*+\-=~][.,;:!?'"]{1}\d{3}$/;
  return regex.test(code);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, code } = await req.json();

    if (action === "set_code") {
      // Set or update security code
      if (!code || !validateCodeFormat(code)) {
        return new Response(
          JSON.stringify({
            error: "Formati i gabuar. Duhet: 1 gërmë e madhe + 3 gërma + 1 simbol + 1 shenjë pikësimi + 3 numra",
            example: "Aabc@.123",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hashed = await hashCode(code);

      const { error } = await supabase.from("user_security_codes").upsert(
        { user_id: user.id, code_hash: hashed, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_code") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Kodi mungon" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: stored, error: fetchError } = await supabase
        .from("user_security_codes")
        .select("code_hash")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!stored) {
        // No security code set - allow pass (first-time user)
        return new Response(JSON.stringify({ verified: true, no_code_set: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hashed = await hashCode(code);
      const verified = hashed === stored.code_hash;

      return new Response(JSON.stringify({ verified }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "has_code") {
      const { data, error: fetchError } = await supabase
        .from("user_security_codes")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      return new Response(JSON.stringify({ has_code: !!data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("security-code-manage error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
