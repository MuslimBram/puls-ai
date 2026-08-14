/**
 * builder-adapter-router — Pulse AI Builder Adapter Layer
 *
 * Routes Pulse Orchestrator commands to external builder platforms:
 *   - Lovable MCP  (https://mcp.lovable.dev)     auth: OAuth (external_oauth_required)
 *   - Emergent MCP (https://mcp.emergent.sh/)    auth: OAuth (external_oauth_required)
 *
 * Architecture contract:
 *   Pulse Orchestrator
 *   └── builder-adapter-router
 *       ├── lovable_mcp adapter
 *       └── emergent_mcp adapter
 *
 * IMPORTANT:
 *   - Does NOT mix with ai-router (AI providers are separate)
 *   - Does NOT execute paid builds in this validation pass
 *   - Does NOT store plaintext OAuth tokens
 *   - DOES use unified_connections for connection state
 *   - DOES log every action to integration_event_logs with idempotency
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── ADAPTER REGISTRY ──────────────────────────────────────────────────────────
// These are tool/builder adapters — NOT AI providers.
// Auth is OAuth-only; no server-side API keys.
const ADAPTERS = {
  lovable_mcp: {
    adapter_key:     "lovable_mcp",
    display_name:    "Lovable MCP",
    category:        "builder",
    connection_type: "mcp_oauth",
    endpoint:        "https://mcp.lovable.dev",
    auth_mode:       "oauth",               // OAuth only — no API key
    oauth_flow:      "client_driven",       // must be completed by client
    capabilities: [
      "create_project", "send_message", "deploy_project",
      "list_projects", "read_file", "list_files",
      "query_database", "get_project",
    ],
    docs: "https://mcp.lovable.dev/docs",
  },
  emergent_mcp: {
    adapter_key:     "emergent_mcp",
    display_name:    "Emergent MCP",
    category:        "builder",
    connection_type: "mcp_oauth",
    endpoint:        "https://mcp.emergent.sh/",
    auth_mode:       "oauth",
    oauth_flow:      "client_driven",
    capabilities: [
      "create_app", "execute_action", "get_status",
      "list_apps", "get_logs", "deploy",
    ],
    docs: "https://mcp.emergent.sh/docs",
  },
} as const;

type AdapterKey = keyof typeof ADAPTERS;

// ── WORKSPACE RESOLUTION ──────────────────────────────────────────────────────
async function resolveWorkspace(
  sb: ReturnType<typeof createClient>,
  userId: string,
  requestedId?: string | null,
): Promise<string | null> {
  if (requestedId) {
    const { data: owned } = await sb.from("workspaces").select("id")
      .eq("id", requestedId).eq("owner_id", userId).maybeSingle();
    if (owned?.id) return owned.id;
    const { data: member } = await sb.rpc("is_workspace_member",
      { _user_id: userId, _workspace_id: requestedId });
    return member ? requestedId : null;
  }
  // Owned first
  const { data: ownedWs } = await sb.from("workspaces").select("id")
    .eq("owner_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (ownedWs?.id) return ownedWs.id;
  // Member fallback
  const { data: memWs } = await sb.from("workspace_members").select("workspace_id")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return memWs?.workspace_id ?? null;
}

// ── CONNECTION MANAGEMENT ─────────────────────────────────────────────────────
// Looks up or creates a stub unified_connection for the adapter + workspace.
// Returns the connection record.
async function getOrCreateConnection(
  sb: ReturnType<typeof createClient>,
  adapterKey: AdapterKey,
  workspaceId: string,
  userId: string,
) {
  const def = ADAPTERS[adapterKey];

  // Look up existing connection
  const { data: existing } = await sb.from("unified_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", adapterKey)
    .eq("category", "builder")
    .maybeSingle();

  if (existing) return existing;

  // Create a stub disconnected connection record
  const { data: created } = await sb.from("unified_connections").insert({
    user_id:               userId,
    workspace_id:          workspaceId,
    provider:              adapterKey,
    category:              "builder",
    connection_type:       "mcp_oauth",
    status:                "disconnected",
    display_name:          def.display_name,
    config_json:           { endpoint: def.endpoint, auth_mode: def.auth_mode, capabilities: def.capabilities },
    credentials_encrypted: {},    // empty — OAuth tokens populated via client flow only
    is_enabled:            false,
    last_error:            "OAuth not yet completed",
  }).select("*").single().catch(() => ({ data: null }));

  return created;
}

// ── EVENT LOGGING ─────────────────────────────────────────────────────────────
// All adapter executions are logged with idempotency.
// Never logs tokens or OAuth secrets — only sanitized metadata.
async function logEvent(
  sb: ReturnType<typeof createClient>,
  opts: {
    integrationId: string;
    userId: string;
    adapterKey: AdapterKey;
    eventType: string;
    eventMessage: string;
    status: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // Use unique idempotency index — duplicate keys are safe (silently ignored)
  await sb.from("integration_event_logs").insert({
    integration_id:  opts.integrationId,
    user_id:         opts.userId,
    event_type:      opts.eventType,
    event_message:   opts.eventMessage,
    status:          opts.status,
    adapter_key:     opts.adapterKey,
    idempotency_key: opts.idempotencyKey,
    metadata:        opts.metadata ?? {},
  }).catch(() => {}); // idempotency conflict = already logged, safe to ignore
}

// ── NORMALIZED ADAPTER RESPONSE ───────────────────────────────────────────────
interface AdapterResult {
  adapter_key:         AdapterKey;
  connection_status:   "connected" | "disconnected" | "external_oauth_required";
  auth_mode:           string;
  capabilities:        readonly string[];
  action?:             string;
  execute_action?:     string;
  normalized_result?:  unknown;
  latency_ms?:         number;
  external_job_id?:    string | null;
  external_project_id?: string | null;
  preview_url?:        string | null;
  error?:              string | null;
  metadata?:           Record<string, unknown>;
  oauth_instructions?: string;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "POST or GET only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // GET /registry — return adapter definitions (no auth required)
  if (req.method === "GET") {
    return json({
      adapters: Object.values(ADAPTERS).map(a => ({
        adapter_key:     a.adapter_key,
        display_name:    a.display_name,
        category:        a.category,
        auth_mode:       a.auth_mode,
        endpoint:        a.endpoint,
        capabilities:    a.capabilities,
        connection_type: a.connection_type,
      })),
      architecture: "builder_adapter_layer",
      note: "These are tool/builder adapters — NOT AI providers. AI routing is separate (ai-router).",
    });
  }

  // POST — execute or validate adapter action
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Internal call support (for Pulse Orchestrator internal routing)
  const isInternal = (() => {
    const secret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    return !!secret && req.headers.get("x-internal-secret") === secret;
  })();

  const { data: { user } } = isInternal
    ? { data: { user: null } }
    : await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (!isInternal && !user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const {
    adapter_key,
    action,
    params = {},
    workspace_id: reqWorkspaceId,
    idempotency_key,
    dry_run = false,  // validation-only flag
  } = body as {
    adapter_key?: string;
    action?: string;
    params?: Record<string, unknown>;
    workspace_id?: string;
    idempotency_key?: string;
    dry_run?: boolean;
  };

  // Validate adapter_key
  if (!adapter_key || !(adapter_key in ADAPTERS)) {
    return json({
      error: `Unknown adapter_key "${adapter_key}". Valid: ${Object.keys(ADAPTERS).join(", ")}`,
      valid_adapters: Object.keys(ADAPTERS),
    }, 400);
  }

  const adKey = adapter_key as AdapterKey;
  const def = ADAPTERS[adKey];

  // Workspace resolution
  const userId = user?.id ?? "system";
  let workspaceId: string | null;
  if (isInternal) {
    workspaceId = reqWorkspaceId ?? null;
  } else if (user) {
    workspaceId = await resolveWorkspace(supabase, user.id, reqWorkspaceId);
    if (!workspaceId) return json({ error: "No authorized workspace found" }, 403);
  } else {
    return json({ error: "Unauthorized" }, 401);
  }

  const start = Date.now();

  // Get/create connection record
  const connection = workspaceId
    ? await getOrCreateConnection(supabase, adKey, workspaceId, userId)
    : null;

  const connectionStatus = (() => {
    if (!connection) return "external_oauth_required";
    if (connection.status === "connected" && connection.is_enabled) return "connected";
    return "external_oauth_required";
  })() as AdapterResult["connection_status"];

  const iKey = idempotency_key ?? `${adKey}:${action ?? "registry"}:${workspaceId}:${Date.now()}`;

  // Log this invocation
  if (connection?.id) {
    await logEvent(supabase, {
      integrationId:  connection.id,
      userId,
      adapterKey:     adKey,
      eventType:      action ? "adapter_action_attempt" : "adapter_registry_check",
      eventMessage:   action
        ? `Action "${action}" attempted on ${def.display_name} — status: ${connectionStatus}`
        : `Registry check for ${def.display_name}`,
      status:         connectionStatus === "connected" ? "pending" : "blocked_oauth_required",
      idempotencyKey: iKey,
      metadata: {
        action,
        dry_run,
        connection_status: connectionStatus,
        workspace_id:      workspaceId,
        // Never log tokens, never log OAuth secrets
      },
    });
  }

  const latency_ms = Date.now() - start;

  // Connection NOT established — return OAuth instructions
  if (connectionStatus !== "connected") {
    const result: AdapterResult = {
      adapter_key:       adKey,
      connection_status: "external_oauth_required",
      auth_mode:         def.auth_mode,
      capabilities:      def.capabilities,
      action,
      normalized_result: null,
      latency_ms,
      external_job_id:    null,
      external_project_id: null,
      preview_url:        null,
      error:             null,
      metadata: {
        endpoint:         def.endpoint,
        workspace_id:     workspaceId,
        oauth_flow:       def.oauth_flow,
        connection_id:    connection?.id ?? null,
      },
      oauth_instructions: [
        `${def.display_name} requires OAuth authentication.`,
        `OAuth flow must be completed via the client-driven flow.`,
        `Endpoint: ${def.endpoint}`,
        `Once authenticated, credentials are stored encrypted in unified_connections.`,
        `No API keys — server-side OAuth token injection is not currently supported.`,
      ].join(" | "),
    };
    return json(result);
  }

  // CONNECTED path — validate or execute
  // In this validation pass: zero-cost actions only (no paid builds)
  if (dry_run || !action) {
    return json({
      adapter_key:       adKey,
      connection_status: "connected",
      auth_mode:         def.auth_mode,
      capabilities:      def.capabilities,
      normalized_result: { validated: true, dry_run: true },
      latency_ms,
      external_job_id:    null,
      external_project_id: null,
      preview_url:        null,
      error:             null,
      metadata:          { workspace_id: workspaceId },
    });
  }

  // Real action execution (future: implement per-capability dispatch)
  // For now: return not_implemented with capability manifest
  return json({
    adapter_key:       adKey,
    connection_status: "connected",
    auth_mode:         def.auth_mode,
    capabilities:      def.capabilities,
    action,
    normalized_result: null,
    latency_ms,
    error: `Action "${action}" execution not yet implemented in this adapter version.`,
    metadata: { workspace_id: workspaceId, note: "Implement per-capability dispatch in next phase" },
  }, 501);
});
