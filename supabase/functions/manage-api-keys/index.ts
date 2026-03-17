import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "lp_";
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "create") {
      const rawKey = generateApiKey();
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.substring(0, 7) + "...";

      const { data, error } = await supabaseAdmin.from("api_keys").insert({
        user_id: user.id,
        workspace_id: body.workspace_id || null,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label: body.label || "Default",
        permissions: body.permissions || ["read", "write"],
        rate_limit_per_minute: body.rate_limit || 60,
      }).select().single();

      if (error) throw error;

      return new Response(JSON.stringify({
        ...data,
        raw_key: rawKey,
        message: "Store this key securely — it won't be shown again.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("api_keys")
        .select("id, key_prefix, label, permissions, is_active, last_used_at, usage_count, rate_limit_per_minute, created_at, revoked_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ keys: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke") {
      if (!body.key_id) throw new Error("key_id required");
      const { error } = await supabaseAdmin.from("api_keys").update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      }).eq("id", body.key_id).eq("user_id", user.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "logs") {
      const { data, error } = await supabaseAdmin.from("api_request_logs")
        .select("*")
        .in("api_key_id", (await supabaseAdmin.from("api_keys").select("id").eq("user_id", user.id)).data?.map((k: any) => k.id) || [])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify({ logs: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action. Use: create, list, revoke, logs");
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
