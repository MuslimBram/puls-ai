import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  getServiceKey() ?? "",
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
    .select("id, user_id, workspace_id, permissions, rate_limit_per_minute, usage_count")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data || !data.workspace_id) throw new Error("Invalid or unscoped API key");

  await supabase.from("api_keys").update({
    last_used_at: new Date().toISOString(),
    usage_count: (data as any).usage_count + 1,
  }).eq("id", data.id);

  return data;
}

function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes("admin") || permissions.includes(required);
}

function publicApiEventId(value: unknown): string {
  if (value == null || value === "") return crypto.randomUUID();
  if (typeof value !== "string") throw new Error("event_id must be a string");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(normalized)) {
    throw new Error("event_id must be 8-160 characters using letters, numbers, _ or -");
  }
  return normalized;
}

async function fireZapierWebhooks(userId: string, workspaceId: string, eventType: string, payload: Record<string, unknown>) {
  const { data: webhooks } = await supabase
    .from("zapier_webhooks")
    .select("id, webhook_url, trigger_count")
    .eq("workspace_id", workspaceId)
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
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const startTime = Date.now();
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const pathResource = pathParts[pathParts.length - 1] ?? "";
  const resource = url.searchParams.get("resource") || (pathResource !== "public-api" ? pathResource : "");
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip");

  let apiKeyData: any;

  try {
    apiKeyData = await authenticateApiKey(req);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
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
          const { data } = await supabase.from("leads").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
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
          await fireZapierWebhooks(user_id, workspace_id, "lead.created", data);
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "messages": {
        if (req.method === "POST") {
          if (!hasPermission(permissions, "write")) throw new Error("Insufficient permissions");
          const body = await req.json();
          if (typeof body.message !== "string" || !body.message.trim()) throw new Error("message is required");

          const eventId = publicApiEventId(body.event_id ?? req.headers.get("x-idempotency-key"));
          const message = body.message.trim();
          const security = await scanInboundContent({
            workspace_id,
            source: "public_api",
            event_id: `api:${eventId}`,
            content: message,
            urls: extractSecurityUrls(message),
            attachment: null,
          });

          if (!security.ok) {
            statusCode = security.status;
            result = { error: "content_security_unavailable", code: security.code, event_id: eventId };
            break;
          }

          if (blocksNormalIngress(security.decision)) {
            statusCode = 202;
            result = { accepted: false, quarantined: true, event_id: eventId };
            break;
          }

          const { data, error } = await supabase.from("inbox_messages").insert({
            user_id,
            workspace_id,
            channel_type: body.channel || "api",
            source_name: "Public API",
            sender_name: body.sender_name || "API",
            sender_identifier: body.sender_identifier,
            message_content: message,
            direction: body.direction || "inbound",
            provider_message_id: eventId,
            metadata: {
              content_security: {
                event_id: `api:${eventId}`,
                category: security.decision.category,
                risk_score: security.decision.risk_score,
                action: security.decision.action,
              },
            },
          }).select().single();

          if (error?.code === "23505") {
            const { data: existing, error: existingError } = await supabase
              .from("inbox_messages")
              .select("*")
              .eq("workspace_id", workspace_id)
              .eq("source_name", "Public API")
              .eq("provider_message_id", eventId)
              .limit(1)
              .maybeSingle();
            if (existingError || !existing) throw existingError ?? new Error("duplicate message lookup failed");
            result = { message: existing, reused: true, event_id: eventId };
            break;
          }
          if (error) throw error;

          result = { message: data, reused: security.reused, event_id: eventId };
          statusCode = 201;
          await fireZapierWebhooks(user_id, workspace_id, "message.received", data);
        } else if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const { data } = await supabase.from("inbox_messages").select("*").eq("workspace_id", workspace_id).order("message_timestamp", { ascending: false }).limit(Math.min(limit, 100));
          result = { messages: data || [] };
        } else {
          throw new Error("Method not allowed");
        }
        break;
      }

      case "deals": {
        if (req.method === "GET") {
          if (!hasPermission(permissions, "read")) throw new Error("Insufficient permissions");
          const { data } = await supabase.from("deals").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(50);
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
          const { data, error } = await supabase.from("deals").update(updateFields).eq("id", body.id).eq("workspace_id", workspace_id).select().single();
          if (error) throw error;
          result = { deal: data };
          await fireZapierWebhooks(user_id, workspace_id, "deal.updated", data);
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
          const { data: wf, error: wfErr } = await supabase
            .from("automation_workflows")
            .select("id, trigger_type, workspace_id, user_id")
            .eq("id", body.workflow_id)
            .eq("workspace_id", workspace_id)
            .maybeSingle();
          if (wfErr) throw wfErr;
          if (!wf) throw new Error("workflow not found");

          const execResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-automation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getServiceKey()}`,
            },
            body: JSON.stringify({
              trigger_type: wf.trigger_type,
              user_id,
              workspace_id: wf.workspace_id,
              trigger_data: { ...(body.metadata || {}), api_trigger: true, workflow_id: wf.id },
            }),
          });
          const execData = await execResp.json();
          result = { automation_run: execData };
          statusCode = 201;
          await fireZapierWebhooks(user_id, workspace_id, "automation.triggered", { workflow_id: wf.id, ...execData });
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
            supabase.from("leads").select("id", { count: "exact" }).eq("workspace_id", workspace_id).gte("created_at", since),
            supabase.from("inbox_messages").select("id", { count: "exact" }).eq("workspace_id", workspace_id).gte("message_timestamp", since),
            supabase.from("deals").select("id, value, status").eq("workspace_id", workspace_id).gte("created_at", since),
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
        }), { status: 404, headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    await logRequest(apiKeyId, workspace_id, resource || "unknown", req.method, statusCode, startTime, ip);

    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  } catch (error: any) {
    const status = error.message?.includes("permission") ? 403 : error.message?.includes("not allowed") ? 405 : 400;
    await logRequest(apiKeyId, workspace_id, resource || "unknown", req.method, status, startTime, ip);
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});