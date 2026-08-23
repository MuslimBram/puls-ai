/**
 * builder-adapter-router v2 — Pulse AI Generic Multi-Builder Foundation
 *
 * Supported adapters (zero-cost validation phase):
 *   emergent_mcp  → https://mcp.emergent.sh/        (OAuth)
 *   base44_mcp    → https://app.base44.com/mcp      (OAuth)
 *   replit_mcp    → https://replit-mcp.com/server/mcp (OAuth 2.1/PKCE, Streamable HTTP)
 *   claude_code   → agent_sdk (NOT MCP OAuth — isolated sandbox execution)
 *
 * Normalized BuilderResult contract is the ONLY shape returned to orchestrators.
 * No platform-specific response leaks past this adapter layer.
 *
 * verify_jwt=true — all requests require a valid Supabase JWT.
 * Internal calls: use x-internal-secret + valid workspace_id for UUID actor resolution.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── ADAPTER REGISTRY ──────────────────────────────────────────────────────────
const ADAPTERS = {
  emergent_mcp: {
    adapter_key:     "emergent_mcp",
    display_name:    "Emergent MCP",
    category:        "builder",
    connection_type: "mcp_oauth",
    endpoint:        "https://mcp.emergent.sh/",
    auth_mode:       "oauth",
    oauth_flow:      "client_driven",
    transport:       "http",
    // Exact public capabilities per Emergent MCP spec
    capabilities: [
      "create_job", "wait_for_job", "send_message", "list_jobs",
      "get_job_status", "get_recent_trajectories", "get_job_preview", "pause_job",
    ],
    capability_discovery: false,
    mutating_actions: ["create_job", "send_message", "pause_job"],
  },
  base44_mcp: {
    adapter_key:     "base44_mcp",
    display_name:    "Base44 MCP",
    category:        "builder",
    connection_type: "mcp_oauth",
    endpoint:        "https://app.base44.com/mcp",
    auth_mode:       "oauth",
    oauth_flow:      "client_driven",
    transport:       "http",
    capabilities: [
      "create_base44_app", "edit_base44_app", "list_user_apps",
      "list_entity_schemas", "query_entities",
    ],
    capability_discovery: false,
    mutating_actions: ["create_base44_app", "edit_base44_app"],
  },
  replit_mcp: {
    adapter_key:     "replit_mcp",
    display_name:    "Replit MCP",
    category:        "builder",
    connection_type: "mcp_oauth_pkce",    // OAuth 2.1 with PKCE
    endpoint:        "https://replit-mcp.com/server/mcp",
    auth_mode:       "oauth_pkce",         // OAuth 2.1 / PKCE
    oauth_flow:      "pkce",
    transport:       "streamable_http",    // Streamable HTTP transport
    capabilities: [
      "create_app_from_prompt", "update_app_using_prompt", "ask_question",
    ],
    capability_discovery: false,
    mutating_actions: ["create_app_from_prompt", "update_app_using_prompt"],
  },
  claude_code: {
    adapter_key:     "claude_code",
    display_name:    "Claude Code",
    category:        "builder",
    connection_type: "agent_sdk",          // NOT MCP OAuth — agent/worker SDK
    endpoint:        null,                 // no remote MCP endpoint — local SDK/CLI
    auth_mode:       "anthropic_api_key",  // uses ANTHROPIC_API_KEY for the agent
    oauth_flow:      null,
    transport:       "local_sdk",
    capabilities: [
      "execute_task", "review_code", "run_tests",
      "write_file", "read_file", "terminal",
    ],
    capability_discovery: false,
    mutating_actions: ["execute_task", "write_file", "terminal"],
    note: "Intended for Claude Code SDK/CLI execution in an isolated sandbox. Not yet active.",
  },
} as const;

type AdapterKey = keyof typeof ADAPTERS;
const MUTATING_ACTIONS = new Set<string>();
for (const ad of Object.values(ADAPTERS)) {
  for (const a of (ad as any).mutating_actions ?? []) MUTATING_ACTIONS.add(`${ad.adapter_key}:${a}`);
}

// ── NORMALIZED BUILDER RESULT ─────────────────────────────────────────────────
interface BuilderResult {
  adapter_key:         string;
  action?:             string;
  connection_status:   "connected" | "disconnected" | "external_oauth_required" | "agent_setup_required";
  run_status?:         "pending" | "running" | "completed" | "failed" | "cancelled" | null;
  external_project_id?: string | null;
  external_job_id?:    string | null;
  branch_name?:        string | null;
  commit_sha?:         string | null;
  preview_url?:        string | null;
  diff_summary?:       string | null;
  build_status?:       string | null;
  test_results?:       unknown;
  latency_ms:          number;
  error?:              string | null;
  metadata?:           Record<string, unknown>;
  oauth_instructions?: string;
  idempotency_key?:    string;
}

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
  const { data: ownedWs } = await sb.from("workspaces").select("id")
    .eq("owner_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (ownedWs?.id) return ownedWs.id;
  const { data: memWs } = await sb.from("workspace_members").select("workspace_id")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return memWs?.workspace_id ?? null;
}

// ── RESOLVE INTERNAL ACTOR (UUID — never "system") ────────────────────────────
// Internal calls have no user JWT. Derive the actor UUID from the workspace owner.
// If workspace cannot be resolved, internal audit is skipped entirely.
async function resolveInternalActor(
  sb: ReturnType<typeof createClient>,
  workspaceId: string | null,
): Promise<string | null> {
  if (!workspaceId) return null;
  const { data: ws } = await sb.from("workspaces")
    .select("owner_id").eq("id", workspaceId).maybeSingle();
  return ws?.owner_id ?? null;  // null = cannot determine actor → skip audit
}

// ── CONNECTION MANAGEMENT ─────────────────────────────────────────────────────
async function getOrCreateConnection(
  sb: ReturnType<typeof createClient>,
  adapterKey: AdapterKey,
  workspaceId: string,
  userId: string,
) {
  const def = ADAPTERS[adapterKey] as any;
  const { data: existing } = await sb.from("unified_connections")
    .select("*").eq("workspace_id", workspaceId).eq("provider", adapterKey)
    .eq("category", "builder").maybeSingle();
  if (existing) return existing;

  let created = null;
  try {
    const { data } = await sb.from("unified_connections").insert({
      user_id:               userId,
      workspace_id:          workspaceId,
      provider:              adapterKey,
      category:              "builder",
      connection_type:       def.connection_type,
      status:                "disconnected",
      display_name:          def.display_name,
      config_json: {
        endpoint:            def.endpoint,
        auth_mode:           def.auth_mode,
        transport:           def.transport,
        capabilities:        def.capabilities,
        capability_discovery: def.capability_discovery ?? false,
      },
      credentials_encrypted: {},
      is_enabled:            false,
      last_error:            def.endpoint
        ? "OAuth not yet completed"
        : "Agent SDK — requires local configuration",
    }).select("*").single();
    created = data;
  } catch { /* INSERT failed silently — connection will be null */ }
  return created;
}

// ── PRE-DISPATCH IDEMPOTENCY CHECK ────────────────────────────────────────────
// For mutating actions: check if idempotency_key was already claimed.
// Returns the existing normalized result if already processed.
// ── ATOMIC IDEMPOTENCY CLAIM ─────────────────────────────────────────────
// State policy for idempotency_key:
//   "claiming"            = INSERT succeeded — this request owns the key, may proceed
//   "pending"             = Concurrent duplicate — UNIQUE conflict, other request owns it, block dispatch
//   "completed"           = Prior dispatch finished — return stored normalized result
//   "failed"              = Prior dispatch failed — key IS RETRYABLE (not poisoned)
//   "disconnected_skipped"= Key was registered but OAuth was not complete — RETRYABLE
//
// "disconnected_skipped" is explicitly retryable:
//   When OAuth completes and action is retried with the SAME idempotency_key,
//   the caller must use a NEW idempotency_key. This prevents stale disconnected state
//   from poisoning a future real dispatch.
interface IdempotencyResult {
  claimed: boolean;                // true = this request atomically claimed the key
  blocked: boolean;                // true = concurrent/completed claim — do not dispatch
  existingResult: BuilderResult | null;  // set when blocked=true and result is stored
  claimId: string | null;          // integration_event_log.id of the claim row
}

async function atomicIdempotencyClaim(
  sb: ReturnType<typeof createClient>,
  idempotencyKey: string,
  integrationId: string,
  userId: string,
  adapterKey: AdapterKey,
  action: string,
  workspaceId: string | null,
): Promise<IdempotencyResult> {
  // Attempt atomic INSERT — only one concurrent request can succeed
  const { data: claimed, error: insertErr } = await sb
    .from("integration_event_logs")
    .insert({
      integration_id:  integrationId,
      user_id:         userId,
      event_type:      "adapter_idempotency_claim",
      event_message:   `Idempotency claim for action "${action}" on ${adapterKey}`,
      status:          "claiming",   // in-flight; updated to completed/failed after dispatch
      adapter_key:     adapterKey,
      idempotency_key: idempotencyKey,
      metadata:        { action, workspace_id: workspaceId, claimed_at: new Date().toISOString() },
    })
    .select("id")
    .single();

  if (!insertErr && claimed?.id) {
    // We own the key — caller may proceed to dispatch
    return { claimed: true, blocked: false, existingResult: null, claimId: claimed.id };
  }

  // UNIQUE conflict (code 23505) = another request already holds this key
  if (insertErr?.code === "23505") {
    const { data: existing } = await sb
      .from("integration_event_logs")
      .select("id, status, metadata")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    const status = existing?.status ?? "pending";

    // disconnected_skipped: adapter was not connected when key was first registered.
    // Same key can be retried after OAuth completes via atomic UPDATE reclaim.
    if (status === "disconnected_skipped") {
      const { data: reclaimed, error: reclaimErr } = await sb.from("integration_event_logs")
        .update({
          status: "claiming",
          metadata: { ...(existing?.metadata as any) ?? {},
            reclaimed_at: new Date().toISOString(), reclaimed_after: "disconnected_skipped" },
        })
        .eq("id", existing!.id)
        .eq("status", "disconnected_skipped")  // conditional — only wins if status hasn't changed
        .select("id").single();
      if (!reclaimErr && reclaimed?.id)
        return { claimed: true, blocked: false, existingResult: null, claimId: reclaimed.id };
      // Another concurrent caller won the reclaim
      return { claimed: false, blocked: true,
        existingResult: {
          adapter_key: adapterKey, action,
          connection_status: "external_oauth_required", run_status: "claiming", latency_ms: 0,
          error: "Concurrent retry in progress — wait for current attempt to complete.",
          idempotency_key: idempotencyKey,
          metadata: { note: "Concurrent reclaim conflict.", duplicate: true },
        } as BuilderResult,
        claimId: existing?.id ?? null };
    }

    // failed: prior dispatch failed — side effects possible — require a new idempotency_key
    if (status === "failed") {
      return { claimed: false, blocked: true,
        existingResult: {
          adapter_key: adapterKey, action,
          connection_status: "disconnected", run_status: "failed", latency_ms: 0,
          error: "Previous dispatch failed. Use a new idempotency_key to retry.",
          idempotency_key: idempotencyKey,
          metadata: { retryable: true, new_key_required: true, previous_status: "failed" },
        } as BuilderResult,
        claimId: existing?.id ?? null };
    }

    // Non-retryable: pending/claiming (in-flight) or completed
    const storedResult = (existing?.metadata as any)?.normalized_result as BuilderResult | null;
    return {
      claimed: false, blocked: true,
      existingResult: storedResult ?? {
        adapter_key: adapterKey, action,
        connection_status: "connected", run_status: status as any,
        latency_ms: 0,
        error: null,
        idempotency_key: idempotencyKey,
        metadata: { note: `Duplicate request blocked. Status: ${status}.`, duplicate: true },
      } as BuilderResult,
      claimId: existing?.id ?? null,
    };
  }

  // Non-conflict insert error — do NOT proceed to dispatch (fail closed)
  console.error("[builder-adapter-router] Idempotency claim INSERT failed:", insertErr?.message);
  return {
    claimed: false, blocked: true,
    existingResult: {
      adapter_key: adapterKey, action,
      connection_status: "disconnected", run_status: null,
      latency_ms: 0,
      error: "Idempotency claim failed — dispatch blocked. Retry safely.",
      idempotency_key: idempotencyKey,
      metadata: { note: "Claim insert error — not a duplicate conflict." },
    } as BuilderResult,
    claimId: null,
  };
}

// ── EVENT LOGGING ─────────────────────────────────────────────────────────────
async function logEvent(
  sb: ReturnType<typeof createClient>,
  opts: {
    integrationId: string;
    userId: string;                 // must be a real UUID — never "system"
    adapterKey: AdapterKey;
    eventType: string;
    eventMessage: string;
    status: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await sb.from("integration_event_logs").insert({
    integration_id:  opts.integrationId,
    user_id:         opts.userId,   // validated UUID from resolveInternalActor or auth user
    event_type:      opts.eventType,
    event_message:   opts.eventMessage,
    status:          opts.status,
    adapter_key:     opts.adapterKey,
    idempotency_key: opts.idempotencyKey,
    metadata:        opts.metadata ?? {},  // NEVER log tokens or OAuth secrets
  }).then(() => {}, () => {});  // ignore errors — log is best-effort
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "POST or GET only" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  // GET /registry — return adapter definitions (JWT required, verify_jwt=true on gateway)
  if (req.method === "GET") {
    return json({
      adapters: Object.values(ADAPTERS).map((a: any) => ({
        adapter_key:          a.adapter_key,
        display_name:         a.display_name,
        category:             a.category,
        connection_type:      a.connection_type,
        auth_mode:            a.auth_mode,
        transport:            a.transport,
        endpoint:             a.endpoint,
        capabilities:         a.capabilities,
        capability_discovery: a.capability_discovery,
        mutating_actions:     a.mutating_actions,
      })),
      architecture: "builder_adapter_layer_v2",
      contract:     "BuilderResult — normalized, no platform-specific leakage",
      note: "Tool/builder adapters. AI providers are routed separately via ai-router.",
    });
  }

  // POST — execute or validate adapter action
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const isInternal = (() => {
    const s = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    return !!s && req.headers.get("x-internal-secret") === s;
  })();

  const { data: { user } } = isInternal
    ? { data: { user: null } }
    : await sb.auth.getUser(authHeader.replace("Bearer ", ""));

  if (!isInternal && !user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const {
    adapter_key, action, workspace_id: reqWsId,
    idempotency_key, dry_run = false,
  } = body as {
    adapter_key?: string; action?: string; workspace_id?: string;
    idempotency_key?: string; dry_run?: boolean;
  };

  // Validate adapter_key — fail closed
  if (!adapter_key || !(adapter_key in ADAPTERS)) {
    return json({
      error: `Unknown adapter_key "${adapter_key}". Valid: ${Object.keys(ADAPTERS).join(", ")}`,
      valid_adapters: Object.keys(ADAPTERS),
    }, 400);
  }

  const adKey = adapter_key as AdapterKey;
  const def = ADAPTERS[adKey] as any;

  // Resolve workspace and actor UUID
  let workspaceId: string | null;
  let actorUserId: string | null;

  if (isInternal) {
    // Internal: workspace_id must be provided; derive actor from workspace owner
    workspaceId  = reqWsId ?? null;
    actorUserId  = await resolveInternalActor(sb, workspaceId);
    // If actor cannot be resolved, audit is skipped — but we still process
  } else if (user) {
    workspaceId = await resolveWorkspace(sb, user.id, reqWsId);
    if (!workspaceId) return json({ error: "No authorized workspace found" }, 403);
    actorUserId = user.id;
  } else {
    return json({ error: "Unauthorized" }, 401);
  }

  const start = Date.now();

  // Connection state
  const connection = workspaceId && actorUserId
    ? await getOrCreateConnection(sb, adKey, workspaceId, actorUserId)
    : null;

  // claude_code is agent_sdk — uses "agent_setup_required" not OAuth flow
  const isAgentSdk = def.connection_type === "agent_sdk";
  const connectionStatus: BuilderResult["connection_status"] = (() => {
    if (connection?.status === "connected" && connection?.is_enabled) return "connected";
    if (isAgentSdk) return "agent_setup_required";
    return "external_oauth_required";
  })();

  // ── PRE-DISPATCH IDEMPOTENCY (mutating actions only) ──────────────────────
  const isMutating = action && MUTATING_ACTIONS.has(`${adKey}:${action}`);
  let activeMutatingClaimId: string | null = null;  // set when claim acquired

  if (isMutating && !dry_run) {
    // Mutating actions require an idempotency_key to prevent duplicate dispatch
    if (!idempotency_key) {
      return json({
        error: "idempotency_key is required for mutating actions to prevent duplicate dispatch.",
        adapter_key: adKey, action, is_mutating: true,
      }, 422);
    }

    // ATOMIC IDEMPOTENCY CLAIM before any future dispatch
    // Must happen before logEvent to avoid logging a duplicate that was blocked
    if (connection?.id && actorUserId) {
      const claimResult = await atomicIdempotencyClaim(
        sb, idempotency_key, connection.id, actorUserId, adKey, action!, workspaceId
      );
      if (claimResult.blocked) {
        return json({ ...(claimResult.existingResult ?? {}), duplicate: true, idempotency_key });
      }
      // claimed=true — store claimId to transition state if adapter is disconnected
      activeMutatingClaimId = claimResult.claimId;
    } else {
      // No connection yet — register key as disconnected_skipped (retryable)
      // This prevents a disconnected state from permanently poisoning the key
      // No real connection yet — idempotency claim requires a valid connection ID.
      // Cannot insert into integration_event_logs without a valid integration_id FK.
      // When OAuth completes and the adapter connects, the caller must use a NEW
      // idempotency_key for the real dispatch. The disconnected state is not poisoning.
    }
  }

  const iKey = idempotency_key
    ?? `${adKey}:${action ?? "registry"}:${workspaceId ?? "no-ws"}:${Date.now()}`;

  // Log this invocation (only when actor UUID is available)
  if (connection?.id && actorUserId) {
    await logEvent(sb, {
      integrationId:  connection.id,
      userId:         actorUserId,  // real UUID from user JWT or workspace owner
      adapterKey:     adKey,
      eventType:      action ? "adapter_action_attempt" : "adapter_registry_check",
      eventMessage:   action
        ? `Action "${action}" on ${def.display_name} — ${connectionStatus}`
        : `Registry check for ${def.display_name}`,
      status:         connectionStatus === "connected" ? "pending" : (isAgentSdk ? "blocked_agent_setup_required" : "blocked_oauth_required"),
      idempotencyKey: iKey,
      metadata: { action, dry_run, connection_status: connectionStatus, workspace_id: workspaceId },
    });
  }

  const latency_ms = Date.now() - start;

  // ── DISCONNECTED / OAUTH REQUIRED ─────────────────────────────────────────
  if (connectionStatus !== "connected") {
    // Transition any in-flight "claiming" → "disconnected_skipped" BEFORE returning.
    // Prevents the key from being permanently stuck in "claiming" with no dispatch.
    if (activeMutatingClaimId) {
      await sb.from("integration_event_logs").update({
        status: "disconnected_skipped",
        metadata: {
          adapter_key: adKey, action, workspace_id: workspaceId,
          connection_status: connectionStatus,
          reason: "adapter_not_connected_at_claim_time",
          retryable: true,
          normalized_result: null,
          transitioned_at: new Date().toISOString(),
        },
      }).eq("id", activeMutatingClaimId).then(() => {}, () => {});  // ignore: best-effort transition
    }
    const result: BuilderResult = {
      adapter_key: adKey, action,
      connection_status: connectionStatus,  // oauth_required or agent_setup_required
      run_status: null,
      external_project_id: null, external_job_id: null,
      branch_name: null, commit_sha: null, preview_url: null,
      diff_summary: null, build_status: null, test_results: null,
      latency_ms, error: null, idempotency_key: iKey,
      metadata: {
        endpoint:      def.endpoint,
        connection_type: def.connection_type,
        auth_mode:     def.auth_mode,
        transport:     def.transport,
        workspace_id:  workspaceId,
        connection_id: connection?.id ?? null,
      },
      oauth_instructions: isAgentSdk
        ? `${def.display_name} requires agent SDK setup. No OAuth flow. Configure ANTHROPIC_API_KEY + isolated worker/sandbox. connection_type=agent_sdk.`
        : `${def.display_name} requires ${def.auth_mode.toUpperCase()} OAuth. Endpoint: ${def.endpoint}. Transport: ${def.transport ?? "http"}. Complete OAuth via client-driven flow. Credentials stored encrypted in unified_connections.`,
    };
    return json(result);
  }

  // ── CONNECTED — DRY RUN / VALIDATION ──────────────────────────────────────
  if (dry_run || !action) {
    const result: BuilderResult = {
      adapter_key: adKey, action,
      connection_status: "connected",
      run_status:  dry_run ? null : undefined,
      external_project_id: null, external_job_id: null,
      branch_name: null, commit_sha: null, preview_url: null,
      diff_summary: null, build_status: null, test_results: null,
      latency_ms, error: null, idempotency_key: iKey,
      metadata: { workspace_id: workspaceId, validated: true, dry_run },
    };
    return json(result);
  }

  // ── CONNECTED — REAL ACTION (not implemented yet) ─────────────────────────
  return json({
    adapter_key: adKey, action,
    connection_status: "connected",
    run_status: null, external_project_id: null, external_job_id: null,
    branch_name: null, commit_sha: null, preview_url: null,
    diff_summary: null, build_status: null, test_results: null,
    latency_ms,
    error: `Action "${action}" dispatch not yet implemented. Multi-Builder Router phase is next.`,
    idempotency_key: iKey,
    metadata: { workspace_id: workspaceId },
  }, 501);
});
