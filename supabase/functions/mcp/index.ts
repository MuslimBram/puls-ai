import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.1";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tools = [
  { name: "whoami", title: "Who am I", description: "Return the authenticated Pulse AI user id and email.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "list_leads", title: "List leads", description: "List the signed-in user's leads, most recent first.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, status: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "create_lead", title: "Create lead", description: "Create a new lead in the signed-in user's CRM.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, email: { type: "string" }, phone: { type: "string" }, source: { type: "string" }, notes: { type: "string" } }, required: ["name"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: "list_inbox_messages", title: "List inbox messages", description: "List recent unified inbox messages for the signed-in user.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, channel: { type: "string" }, unread_only: { type: "boolean" } }, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "list_deals", title: "List deals", description: "List the signed-in user's CRM deals.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, stage: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "list_business_profiles", title: "List business profiles", description: "List the signed-in user's Pulse AI business profiles.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "list_inbox_threads", title: "List inbox threads", description: "List unified inbox conversation threads for the signed-in user.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, channel_type: { type: "string" }, status: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "search_knowledge", title: "Search knowledge base", description: "Search the signed-in user's knowledge base chunks.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2 }, limit: { type: "integer", minimum: 1, maximum: 50 }, business_id: { type: "string", format: "uuid" } }, required: ["query"], additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } },
];

const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const error = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const toolResult = (value: unknown, key?: string) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  ...(key ? { structuredContent: { [key]: value } } : {}),
});

async function getContext(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Not authenticated");
  const token = authorization.slice(7).trim();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase configuration missing");
  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) throw new Error("Not authenticated");
  return { sb, user };
}

async function callTool(req: Request, name: string, args: Record<string, unknown>) {
  const { sb, user } = await getContext(req);
  switch (name) {
    case "whoami": return toolResult({ user_id: user.id, email: user.email ?? null });
    case "list_leads": {
      let q = sb.from("leads").select("*").order("created_at", { ascending: false }).limit(Number(args.limit ?? 20));
      if (args.status) q = q.eq("status", String(args.status));
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return toolResult(data ?? [], "leads");
    }
    case "create_lead": {
      const nameValue = String(args.name ?? "").trim();
      if (!nameValue) throw new Error("name is required");
      const { data, error: queryError } = await sb.from("leads").insert({
        user_id: user.id,
        name: nameValue,
        email: args.email ? String(args.email) : null,
        phone: args.phone ? String(args.phone) : null,
        source: args.source ? String(args.source) : "mcp",
        notes: args.notes ? String(args.notes) : null,
        status: "new",
      }).select().single();
      if (queryError) throw queryError;
      return toolResult(data, "lead");
    }
    case "list_inbox_messages": {
      let q = sb.from("inbox_messages").select("*").order("created_at", { ascending: false }).limit(Number(args.limit ?? 20));
      if (args.channel) q = q.eq("channel", String(args.channel));
      if (args.unread_only) q = q.eq("is_read", false);
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return toolResult(data ?? [], "messages");
    }
    case "list_deals": {
      let q = sb.from("deals").select("*").order("updated_at", { ascending: false }).limit(Number(args.limit ?? 20));
      if (args.stage) q = q.eq("stage", String(args.stage));
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return toolResult(data ?? [], "deals");
    }
    case "list_business_profiles": {
      const { data, error: queryError } = await sb.from("business_profiles").select("*").order("created_at", { ascending: false }).limit(Number(args.limit ?? 20));
      if (queryError) throw queryError;
      return toolResult(data ?? [], "businesses");
    }
    case "list_inbox_threads": {
      let q = sb.from("conversation_threads").select("*").order("last_message_at", { ascending: false }).limit(Number(args.limit ?? 20));
      if (args.channel_type) q = q.eq("channel_type", String(args.channel_type));
      if (args.status) q = q.eq("status", String(args.status));
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return toolResult(data ?? [], "threads");
    }
    case "search_knowledge": {
      const query = String(args.query ?? "").replace(/[%_]/g, "").trim();
      if (query.length < 2) throw new Error("query must contain at least 2 characters");
      let q = sb.from("knowledge_chunks").select("id, business_id, content, content_type, chunk_index, created_at").ilike("content", `%${query}%`).order("created_at", { ascending: false }).limit(Number(args.limit ?? 10));
      if (args.business_id) q = q.eq("business_id", String(args.business_id));
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return toolResult(data ?? [], "chunks");
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handle(req: Request, message: any) {
  const id = message?.id;
  if (message?.method === "initialize") return ok(id, {
    protocolVersion: message?.params?.protocolVersion ?? "2025-06-18",
    capabilities: { tools: {} },
    serverInfo: { name: "pulse-ai-mcp", version: "0.1.0" },
  });
  if (message?.method === "ping") return ok(id, {});
  if (message?.method === "tools/list") return ok(id, { tools });
  if (message?.method === "tools/call") {
    try {
      return ok(id, await callTool(req, String(message?.params?.name ?? ""), (message?.params?.arguments ?? {}) as Record<string, unknown>));
    } catch (toolError) {
      return ok(id, { content: [{ type: "text", text: toolError instanceof Error ? toolError.message : "Tool failed" }], isError: true });
    }
  }
  if (typeof message?.method === "string" && message.method.startsWith("notifications/")) return null;
  return error(id, -32601, "Method not found");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers });
  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify(error(null, -32700, "Parse error")), { status: 400, headers }); }
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((message) => handle(req, message)))).filter(Boolean);
    return new Response(JSON.stringify(responses), { status: responses.length ? 200 : 202, headers });
  }
  const result = await handle(req, payload);
  return result ? new Response(JSON.stringify(result), { status: 200, headers }) : new Response(null, { status: 202, headers });
});
