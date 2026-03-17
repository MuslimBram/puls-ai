import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function authenticateApiKey(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) throw new Error("Missing x-api-key header");

  const keyHash = await hashKey(apiKey);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, workspace_id, permissions, rate_limit_per_minute")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) throw new Error("Invalid API key");

  // Update usage
  await supabase.from("api_keys").update({
    last_used_at: new Date().toISOString(),
    usage_count: (data as any).usage_count + 1,
  }).eq("id", data.id);

  return data;
}

function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes("admin") || permissions.includes(required);
}

async function fireZapierWebhooks(userId: string, eventType: string, payload: Record<string, unknown>) {
  const { data: webhooks } = await supabase
    .from("zapier_webhooks")
    .select("id, webhook_url")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .eq("is_active", true);

  if (!webhooks?.length) return;

  for (const wh of webhooks) {
    try {
      await fetch(wh.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data: payload }),
      });
      await supabase.from("zapier_webhooks").update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: (wh as any).trigger_count + 1,
      }).eq("id", wh.id);
    } catch (e) {
      console.error(`[ZAPIER] Failed to fire webhook ${wh.id}:`, e);
    }
  }
}

async function logRequest(apiKeyId: string, workspaceId: string | null, endpoint: string, method: string, statusCode: number, startTime: number, ip: string | null) {
  await supabase.from("api_request_logs").insert({
    api_key_id: apiKeyId,
    workspace_id: workspaceId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: Date.now() - startTime,
    ip_address: ip,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected: /public-api/{resource}
  const resource = pathParts[pathParts.length - 1] || url.searchParams.get("resource");
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip");

  let apiKeyData: any;

  try {
    apiKeyData = await authenticateApiKey(req);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { id: apiKeyId, user_id, workspace_id, permissions } = apiKeyData;

  try {
    let result: any;
    let statusCode = 200;

    switch (resource) {
      case "leads": {
        if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const { data } = await supabase.from("leads").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
          result = { leads: data || [] };
        } else if (req.method === "POST") {
          if (!hasPermission(permissions, "write")) throw new Error("Insufficient permissions");
          const body = await req.json();
          const { data, error } = await supabase.from("leads").insert({
            user_id,
            workspace_id,
            name: body.name,
            email: body.email,
            phone: body.phone,
            source: body.source || "api",
            status: body.status || "new",
            notes: body.notes,
          }).select().single();
          if (error) throw error;
          result = { lead: data };
          statusCode = 201;
          await fireZapierWebhooks(user_id, "lead.created", data);
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "messages": {
        if (req.method === "POST") {
          if (!hasPermission(permissions, "write")) throw new Error("Insufficient permissions");
          const body = await req.json();
          const { data, error } = await supabase.from("inbox_messages").insert({
            user_id,
            workspace_id,
            channel_type: body.channel || "api",
            sender_name: body.sender_name || "API",
            sender_identifier: body.sender_identifier,
            message_body: body.message,
            direction: body.direction || "inbound",
          }).select().single();
          if (error) throw error;
          result = { message: data };
          statusCode = 201;
          await fireZapierWebhooks(user_id, "message.received", data);
        } else if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const { data } = await supabase.from("inbox_messages").select("*").eq("user_id", user_id).order("message_timestamp", { ascending: false }).limit(Math.min(limit, 100));
          result = { messages: data || [] };
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "deals": {
        if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const { data } = await supabase.from("deals").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(50);
          result = { deals: data || [] };
        } else if (req.method === "PUT" || req.method === "PATCH") {
          if (!hasPermission(permissions, "write")) throw new Error("Insufficient permissions");
          const body = await req.json();
          if (!body.id) throw new Error("deal id required");
          const updateFields: any = {};
          if (body.status) updateFields.status = body.status;
          if (body.value !== undefined) updateFields.value = body.value;
          if (body.stage_id) updateFields.stage_id = body.stage_id;
          if (body.title) updateFields.title = body.title;
          const { data, error } = await supabase.from("deals").update(updateFields).eq("id", body.id).eq("user_id", user_id).select().single();
          if (error) throw error;
          result = { deal: data };
          await fireZapierWebhooks(user_id, "deal.updated", data);
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "automations": {
        if (req.method === "POST") {
          if (!hasPermission(permissions, "write")) throw new Error("Insufficient permissions");
          const body = await req.json();
          if (!body.workflow_id) throw new Error("workflow_id required");
          // Trigger automation by inserting a log entry
          const { data, error } = await supabase.from("automation_logs").insert({
            user_id,
            workflow_id: body.workflow_id,
            trigger_event: "api_trigger",
            status: "queued",
            metadata: body.metadata || {},
          }).select().single();
          if (error) throw error;
          result = { automation_run: data };
          statusCode = 201;
          await fireZapierWebhooks(user_id, "automation.triggered", data);
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "analytics": {
        if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const days = parseInt(url.searchParams.get("days") || "7");
          const since = new Date(Date.now() - days * 86400000).toISOString();
          
          const [leadsRes, msgsRes, dealsRes] = await Promise.all([
            supabase.from("leads").select("id", { count: "exact" }).eq("user_id", user_id).gte("created_at", since),
            supabase.from("inbox_messages").select("id", { count: "exact" }).eq("user_id", user_id).gte("message_timestamp", since),
            supabase.from("deals").select("id, value, status").eq("user_id", user_id).gte("created_at", since),
          ]);

          const deals = dealsRes.data || [];
          result = {
            period_days: days,
            leads_count: leadsRes.count || 0,
            messages_count: msgsRes.count || 0,
            deals_count: deals.length,
            deals_won: deals.filter(d => d.status === "won").length,
            revenue_potential: deals.reduce((s, d) => s + (d.value || 0), 0),
          };
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      default:
        return new Response(JSON.stringify({
          error: "Unknown resource",
          available: ["leads", "messages", "deals", "automations", "analytics"],
          docs: "Use ?resource={name} or /{name} path",
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await logRequest(apiKeyId, workspace_id, resource || "unknown", req.method, statusCode, startTime, ip);

    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    const status = error.message?.includes("permission") ? 403 : error.message?.includes("not allowed") ? 405 : 400;
    await logRequest(apiKeyId, workspace_id, resource || "unknown", req.method, status, startTime, ip);
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
