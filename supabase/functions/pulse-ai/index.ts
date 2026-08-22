// supabase/functions/pulse-ai/index.ts
// ============================================================
// AI-2: Canonical Pulse AI Orchestration Facade
//
// ARCHITECTURE:
//   Application / Channel / Module
//   → pulse-ai (this function) — canonical application-layer orchestrator
//   → AI-4 unified memory facade (workspace ai-router path only)
//   → customer-brain (CANONICAL_BUSINESS_BRAIN) | ai-router (CANONICAL_PROVIDER_ROUTER)
//   → AI Provider (selected exclusively by ai-router)
//
// SECURITY:
//   USER path:     JWT → getUser() → is_workspace_member() → workspace-scoped dispatch
//   INTERNAL path: x-internal-secret / x-cron-secret → workspace_id still required
//   PUBLIC path:   customer_support use case only — no CRM / workspace data exposed
//
// PROVIDER BYPASS:
//   NO direct Anthropic / OpenAI / Gemini / Groq / DeepSeek / Mistral / etc. calls.
//   All provider execution delegated exclusively to the canonical ai-router.
//
// AI-3 BOUNDARY: No commercial actions executed (no emails, messages, tickets, CRM writes).
// AI-4 BOUNDARY: Workspace ai-router requests use canonical scoped memory; public support never loads it.
// AI-5 BOUNDARY: No end-to-end Golden Journey runtime here.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import {
  buildMemoryContextBlock,
  resolveWorkspaceMemory,
  type PulseMemoryResponse,
} from "../_shared/pulse-memory-facade.ts";
import {
  type BusinessUseCase,
  type ChannelSource,
  type PulseAIRequest,
  type PulseAIResponse,
  createErrorResponse,
  createSuccessResponse,
  isPublicUseCase,
  isSupportedUseCase,
  isWorkspaceUseCase,
  resolveCapability,
  resolveRouterTaskType,
} from "../_shared/pulse-ai-facade.ts";

// ── Supabase service-role client (used only after authorization) ──────────────
const SVC = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!, {
    auth: { persistSession: false },
  });

const cors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });

// ── Workspace membership verification (USER path only) ───────────────────────
async function requireWorkspaceMember(
  sb: ReturnType<typeof SVC>,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const [{ data: m }, { data: o }] = await Promise.all([
    sb.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
    sb
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", userId)
      .maybeSingle(),
  ]);
  return !!(m || o);
}

// ── Capability: Customer Brain ────────────────────────────────────────────────
// Delegates to the existing canonical business brain for customer_evaluation
// and segment_suggestion. The brain is NOT replaced — it is preserved and reused.
async function dispatchToCustomerBrain(
  req: PulseAIRequest,
): Promise<PulseAIResponse> {
  const action = req.useCase === "segment_suggestion" ? "segment" : "evaluate";

  // customer_evaluation requires a contact/lead reference
  if (action === "evaluate" && !req.contactId) {
    return createErrorResponse(
      req.requestId,
      req.workspaceId,
      req.useCase,
      "MISSING_CONTEXT",
      "contact_id is required for customer_evaluation",
    );
  }

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", getServiceKey()].join(" "),
        "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify({
        action,
        workspace_id: req.workspaceId,
        lead_id: req.contactId,
        ...(req.input.structured ?? {}),
      }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return createErrorResponse(
          req.requestId,
          req.workspaceId,
          req.useCase,
          "FORBIDDEN_WORKSPACE",
          "Workspace access denied by Customer Brain",
        );
      }
      return createErrorResponse(
        req.requestId,
        req.workspaceId,
        req.useCase,
        "ROUTER_UNAVAILABLE",
        "Customer Brain unavailable",
      );
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Extract human_handoff signal from NBA result
    const nbaActionType = data.action_type as string | undefined;
    const humanHandoff = nbaActionType === "human_handoff";

    // Suggested next action — NOT executed by AI-2 (AI-3 scope)
    const suggestedNextAction =
      nbaActionType && nbaActionType !== "do_nothing" && !humanHandoff
        ? { type: nbaActionType, reason: (data.reason as string) ?? "" }
        : undefined;

    return createSuccessResponse(req.requestId, req.workspaceId, req.useCase, {
      answer: data.reason as string | undefined,
      structuredData: data,
      confidence: data.confidence as number | undefined,
      routerTaskType: resolveRouterTaskType(req.useCase),
      humanHandoffRecommended: humanHandoff,
      suggestedNextAction,
    });
  } catch {
    return createErrorResponse(
      req.requestId,
      req.workspaceId,
      req.useCase,
      "ROUTER_UNAVAILABLE",
      "Customer Brain call failed",
    );
  }
}

// ── Capability: AI Router (workspace use cases) ───────────────────────────────
// Uses canonical ai-router-helper. Provider/model selection is AI Router's job.
async function dispatchToAIRouter(
  req: PulseAIRequest,
  memory?: PulseMemoryResponse,
): Promise<PulseAIResponse> {
  // Require meaningful input before consuming tokens
  if (!req.input.text && !req.input.structured) {
    return createErrorResponse(
      req.requestId,
      req.workspaceId,
      req.useCase,
      "MISSING_CONTEXT",
      "input.text or input.structured is required",
    );
  }

  const taskType = resolveRouterTaskType(req.useCase);

  const systemPrompt = buildSystemPrompt(req, memory);
  const messages = buildMessages(req);

  try {
    const text = await callAIRouter(messages, systemPrompt, {
      taskType,
      workspaceId: req.workspaceId,
      userId: req.userId,
      maxTokens: 800,
    });

    return createSuccessResponse(req.requestId, req.workspaceId, req.useCase, {
      answer: text,
      routerTaskType: taskType,
      usageMetadata: { provider: "ai-router", model: "ai-router" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Normalize: never expose raw provider error details to caller
    const code =
      msg.includes("router") || msg.includes("unavailable") || msg.includes("503")
        ? ("ROUTER_UNAVAILABLE" as const)
        : ("PROVIDER_FAILURE_EXHAUSTED" as const);

    return createErrorResponse(
      req.requestId,
      req.workspaceId,
      req.useCase,
      code,
      "AI Router call failed; no provider available",
    );
  }
}

// ── Capability: Public Support (no workspace data) ────────────────────────────
// Handles customer_support use case. No CRM, Customer Memory, or Business Memory.
// Calls ai-router with customer_support task type (internal path, no workspace_id).
async function dispatchPublicSupport(req: PulseAIRequest): Promise<PulseAIResponse> {
  const systemPrompt =
    "You are the Pulse AI product assistant. " +
    "Answer questions about Pulse AI product features, pricing, and capabilities " +
    "using only approved public information. " +
    "Never reveal CRM data, customer details, workspace configuration, or any " +
    "workspace-private information. If asked for private data, politely decline. " +
    `Respond in ${req.locale ?? "en"}.`;

  // Public support uses its own inline fallback ("How can I help you?") rather than
  // buildMessages, because: (a) structured input is not meaningful without workspace
  // context, and (b) the greeting produces a better public-facing default than
  // "Please analyze and respond."
  const messages = req.input.text
    ? [{ role: "user", content: req.input.text }]
    : [{ role: "user", content: "How can I help you?" }];

  // Public path: no workspace_id → ai-router allows this for customer_support
  // per AI-1B (allowInternalNoWorkspaceCustomerSupport flag).
  try {
    const text = await callAIRouter(messages, systemPrompt, {
      taskType: "customer_support",
      maxTokens: 600,
      // workspaceId intentionally absent — public path must not scope to a workspace
    });

    return createSuccessResponse(req.requestId, req.workspaceId, req.useCase, {
      answer: text,
      routerTaskType: "customer_support",
    });
  } catch {
    return createErrorResponse(
      req.requestId,
      req.workspaceId,
      req.useCase,
      "ROUTER_UNAVAILABLE",
      "AI Router unavailable for public support",
    );
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildSystemPrompt(
  req: PulseAIRequest,
  memory?: PulseMemoryResponse,
): string {
  const localeHint = req.locale ? ` Respond in ${req.locale}.` : "";
  const base = `You are Pulse AI, assisting a workspace.${localeHint}`;
  let instruction: string;

  if (req.useCase === "lead_analysis") {
    instruction = `${base} Analyze the provided lead data and return a structured classification with intent, priority, and recommended next step.`;
  } else if (req.useCase === "business_insight") {
    instruction = `${base} Provide a concise, actionable business insight based on the provided context.`;
  } else if (req.useCase === "complex_reasoning") {
    instruction = `${base} Reason step by step and provide a thorough, evidence-based answer.`;
  } else {
    instruction = `${base} Be concise and helpful.`;
  }

  // AI-4 memory is evidence only. Denied/empty memory produces an empty block.
  return `${instruction}${memory ? buildMemoryContextBlock(memory) : ""}`;
}

function buildMessages(
  req: PulseAIRequest,
): Array<{ role: string; content: string }> {
  if (req.input.text) {
    return [{ role: "user", content: req.input.text }];
  }
  if (req.input.structured) {
    return [{ role: "user", content: JSON.stringify(req.input.structured) }];
  }
  return [{ role: "user", content: "Please analyze and respond." }];
}

// ── Main request handler ──────────────────────────────────────────────────────

Deno.serve(async (httpReq: Request) => {
  if (httpReq.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...cors(httpReq),
        "Access-Control-Allow-Headers":
          "authorization,content-type,x-internal-secret,x-cron-secret",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }

  if (httpReq.method !== "POST") {
    return json(httpReq, { error: "Method not allowed" }, 405);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await httpReq.json();
  } catch {
    return json(
      httpReq,
      {
        success: false,
        workspaceId: "",
        humanHandoffRecommended: false,
        errorCode: "MISSING_CONTEXT",
        errorMessage: "Invalid JSON body",
      },
      400,
    );
  }

  const {
    request_id: rawRequestId,
    use_case: rawUseCase,
    workspace_id: rawWorkspaceId,
    source: rawSource,
    contact_id: rawContactId,
    conversation_id: rawConversationId,
    locale: rawLocale,
    input: rawInput,
  } = body;

  // Derive or generate request correlation ID
  const requestId =
    typeof rawRequestId === "string" && rawRequestId
      ? rawRequestId
      : crypto.randomUUID();

  // ── Validate use case ───────────────────────────────────────────────────────
  if (!isSupportedUseCase(rawUseCase)) {
    return json(
      httpReq,
      {
        requestId,
        success: false,
        workspaceId: "",
        useCase: rawUseCase,
        humanHandoffRecommended: false,
        errorCode: "UNSUPPORTED_CAPABILITY",
        errorMessage: `Unsupported use_case: "${rawUseCase}"`,
      },
      400,
    );
  }

  const useCase = rawUseCase as BusinessUseCase;

  // ── Authentication state machine ────────────────────────────────────────────
  //
  // Three canonical paths — evaluated in strict priority order:
  //
  // 1. INTERNAL: verified internal/cron secret → workspace-scoped dispatch
  // 2. PUBLIC:   customer_support use case, no JWT → public-support dispatch only
  //              NEVER gains workspace access even if workspace_id is supplied
  // 3. USER:     valid JWT required → workspace membership verified → workspace dispatch
  //
  // PUBLIC path is checked AFTER internal but BEFORE JWT-required paths, so that a
  // logged-out public visitor calling customer_support never sees a 401.

  const internalSecret = httpReq.headers.get("x-internal-secret");
  // cronSecret is read ONLY from the dedicated header — never falls back to
  // Authorization — to prevent a user JWT from satisfying the CRON_SECRET check.
  const cronSecret = httpReq.headers.get("x-cron-secret");
  const configInternal = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  const configCron = Deno.env.get("CRON_SECRET");

  const isInternal =
    (!!configInternal && internalSecret === configInternal) ||
    (!!configCron && cronSecret === configCron);

  // PUBLIC path: customer_support may be called without a JWT.
  // A supplied workspace_id is silently ignored — public support NEVER scopes to a workspace.
  const isPublicSupportRequest = !isInternal && isPublicUseCase(useCase);

  let authedUserId: string | null = null;
  const sb = SVC();

  if (!isInternal && !isPublicSupportRequest) {
    // USER path: JWT is mandatory for all workspace use cases.
    const authHeader = httpReq.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(
        httpReq,
        createErrorResponse(requestId, "", useCase, "UNAUTHORIZED", "Missing authorization"),
        401,
      );
    }
    const {
      data: { user },
      error: ue,
    } = await sb.auth.getUser(authHeader.slice(7));
    if (ue || !user) {
      return json(
        httpReq,
        createErrorResponse(requestId, "", useCase, "UNAUTHORIZED", "Invalid token"),
        401,
      );
    }
    authedUserId = user.id;
  }

  // ── Workspace verification ──────────────────────────────────────────────────
  // PUBLIC use cases (customer_support): no workspace required; workspace data never loaded.
  //   Even if workspace_id is present in the body it is IGNORED — not verified, not used.
  // WORKSPACE use cases: workspace_id required and membership verified.
  let verifiedWorkspaceId = "";

  if (isWorkspaceUseCase(useCase)) {
    // isPublicSupportRequest is false here (customer_support is the only public use case)
    if (!rawWorkspaceId || typeof rawWorkspaceId !== "string") {
      return json(
        httpReq,
        createErrorResponse(requestId, "", useCase, "MISSING_CONTEXT", "workspace_id required"),
        400,
      );
    }

    if (!isInternal) {
      // USER path: NEVER trust browser-provided workspace_id without membership verification.
      // This is the forged-workspace protection boundary.
      const isMember = await requireWorkspaceMember(sb, authedUserId!, rawWorkspaceId);
      if (!isMember) {
        return json(
          httpReq,
          createErrorResponse(
            requestId,
            rawWorkspaceId,
            useCase,
            "FORBIDDEN_WORKSPACE",
            "Not a member of this workspace",
          ),
          403,
        );
      }
    }
    // INTERNAL path: workspace_id is server-provided for scoping; accepted without JWT check.
    verifiedWorkspaceId = rawWorkspaceId;
  }
  // PUBLIC path: verifiedWorkspaceId remains "" — public support has no workspace scope.

  // ── Build canonical request ─────────────────────────────────────────────────
  const input =
    typeof rawInput === "object" && rawInput !== null
      ? (rawInput as { text?: string; structured?: Record<string, unknown> })
      : {};

  // Determine authContextType and canonical source.
  // - INTERNAL callers get "internal_service" and should pass their own source.
  // - PUBLIC callers (no JWT) get "public_unauthenticated" and default source "public".
  // - USER callers (valid JWT) get "user_jwt" and default source "workspace_ui".
  const authContextType = isInternal
    ? "internal_service"
    : isPublicSupportRequest
    ? "public_unauthenticated"
    : "user_jwt";

  const defaultSource = isPublicSupportRequest ? "public" : "workspace_ui";

  const pulseReq: PulseAIRequest = {
    requestId,
    workspaceId: verifiedWorkspaceId,
    userId: authedUserId ?? undefined,
    authContextType,
    useCase,
    source: (typeof rawSource === "string" ? rawSource : defaultSource) as ChannelSource,
    contactId: typeof rawContactId === "string" ? rawContactId : undefined,
    conversationId:
      typeof rawConversationId === "string" ? rawConversationId : undefined,
    locale: typeof rawLocale === "string" ? rawLocale : undefined,
    input,
  };

  // ── Observability: log request metadata (no secrets) ───────────────────────
  const capability = resolveCapability(useCase);
  console.log(
    JSON.stringify({
      event: "pulse_ai_request",
      requestId,
      workspaceId: verifiedWorkspaceId,
      useCase,
      capability,
      source: pulseReq.source,
      authContextType: pulseReq.authContextType,
    }),
  );

  // ── AI-4 canonical memory resolution ───────────────────────────────────────
  // Only workspace AI Router reasoning receives memory. Public support never calls
  // this path, and Customer Brain retains its existing specialized context logic.
  let workspaceMemory: PulseMemoryResponse | undefined;
  if (capability === "ai_router_direct") {
    const memoryQuery = pulseReq.input.text ??
      (pulseReq.input.structured
        ? JSON.stringify(pulseReq.input.structured).slice(0, 1500)
        : undefined);

    workspaceMemory = await resolveWorkspaceMemory(sb, {
      workspaceId: verifiedWorkspaceId,
      userId: authedUserId ?? undefined,
      contactId: pulseReq.contactId,
      conversationId: pulseReq.conversationId,
      query: memoryQuery,
      limit: 12,
      correlationId: requestId,
      authContext: {
        type: pulseReq.authContextType,
        workspaceVerified: Boolean(verifiedWorkspaceId),
        userId: authedUserId ?? undefined,
      },
    });

    console.log(
      JSON.stringify({
        event: "pulse_ai_memory_context",
        requestId,
        workspaceId: verifiedWorkspaceId,
        success: workspaceMemory.success,
        entries: workspaceMemory.entries.length,
        errorCode: workspaceMemory.errorCode ?? null,
        sources: workspaceMemory.sourceStatus,
      }),
    );
  }

  // ── Dispatch to canonical capability ───────────────────────────────────────
  // Capability selection: facade's responsibility.
  // Provider/model selection: AI Router's responsibility exclusively.
  let response: PulseAIResponse;

  if (capability === "customer_brain") {
    response = await dispatchToCustomerBrain(pulseReq);
  } else if (capability === "public_support") {
    response = await dispatchPublicSupport(pulseReq);
  } else {
    // ai_router_direct
    response = await dispatchToAIRouter(pulseReq, workspaceMemory);
  }

  // ── Observability: log response metadata (no secrets, no provider dumps) ───
  console.log(
    JSON.stringify({
      event: "pulse_ai_response",
      requestId,
      workspaceId: verifiedWorkspaceId,
      useCase,
      capability,
      routerTaskType: response.routerTaskType,
      success: response.success,
      errorCode: response.errorCode ?? null,
      humanHandoffRecommended: response.humanHandoffRecommended,
    }),
  );

  const statusCode = response.success
    ? 200
    : response.errorCode === "UNAUTHORIZED"
    ? 401
    : response.errorCode === "FORBIDDEN_WORKSPACE"
    ? 403
    : response.errorCode === "MISSING_CONTEXT" ||
      response.errorCode === "UNSUPPORTED_CAPABILITY"
    ? 400
    : 500;

  return json(httpReq, response, statusCode);
});