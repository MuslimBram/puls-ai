/**
 * AI-2: Canonical Pulse AI Orchestration Facade — Contracts & Pure Helpers
 *
 * Defines the canonical request/response types, business use-case taxonomy,
 * capability routing tables, and pure (no-network) helper functions.
 *
 * NO network calls. All orchestration lives in supabase/functions/pulse-ai/index.ts.
 *
 * ARCHITECTURAL BOUNDARIES:
 *   AI-2 scope : orchestration facade, request/response contracts, capability dispatch
 *   AI-3 scope : controlled action execution (emails, bookings, CRM writes) — NOT HERE
 *   AI-4 scope : unified workspace memory/context architecture — NOT HERE
 *   AI-5 scope : end-to-end Golden Journey runtime — NOT HERE
 */

// ── Business use cases (application-layer taxonomy) ──────────────────────────
// DISTINCT from AI Router task types. Mapping is explicit in USE_CASE_TO_ROUTER_TASK_TYPE.
export const BUSINESS_USE_CASES = [
  "customer_evaluation",  // Evaluate a customer/lead → Next Best Action (Customer Brain)
  "segment_suggestion",   // AI-assisted audience segment criteria (Customer Brain)
  "business_insight",     // Workspace business reasoning (AI Router complex_reasoning)
  "general_reasoning",    // General workspace AI task (AI Router balanced)
  "complex_reasoning",    // Complex multi-step workspace reasoning (AI Router complex_reasoning)
  "lead_analysis",        // Classify/score a lead (AI Router text_classification)
  "customer_support",     // Public Pulse AI product support — no workspace data exposed
] as const;

export type BusinessUseCase = (typeof BUSINESS_USE_CASES)[number];

// ── Channel/source taxonomy ───────────────────────────────────────────────────
export const CHANNEL_SOURCES = [
  "workspace_ui",  // Authenticated workspace user via browser
  "api",           // Workspace API caller (service key with verified workspace)
  "internal_cron", // Internal scheduled/automation call
  "public",        // Unauthenticated public caller
] as const;

export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

// ── Normalized error codes ────────────────────────────────────────────────────
// Callers need NO provider-specific handling. No raw provider responses exposed.
export const PULSE_AI_ERROR_CODES = [
  "UNAUTHORIZED",               // Missing or invalid auth token
  "FORBIDDEN_WORKSPACE",        // Valid auth but no membership in claimed workspace
  "MISSING_CONTEXT",            // Required field absent (workspace_id, contact_id, etc.)
  "UNSUPPORTED_CAPABILITY",     // use_case not recognized
  "ENTITLEMENT_EXHAUSTED",      // Usage/quota limit reached
  "ROUTER_UNAVAILABLE",         // AI Router or downstream capability unreachable
  "PROVIDER_FAILURE_EXHAUSTED", // All provider failover chains failed
  "MALFORMED_STRUCTURED_OUTPUT",// Capability returned unparseable structured data
  "SAFE_FALLBACK_USED",         // Degraded path used; result may be lower quality
] as const;

export type PulseAIErrorCode = (typeof PULSE_AI_ERROR_CODES)[number];

// ── Internal capability taxonomy ──────────────────────────────────────────────
// The facade selects a CAPABILITY, never a specific AI provider.
export const INTERNAL_CAPABILITIES = [
  "customer_brain",   // customer-brain edge function (workspace-aware, NBA logic)
  "ai_router_direct", // AI Router via canonical ai-router-helper (provider-agnostic)
  "public_support",   // Public support path — no workspace CRM/memory data
] as const;

export type InternalCapability = (typeof INTERNAL_CAPABILITIES)[number];

// ── Canonical request contract ────────────────────────────────────────────────
export interface PulseAIRequest {
  /** Caller-provided correlation ID. Echoed verbatim in response. */
  requestId: string;

  /**
   * Workspace ID — client-provided but ALWAYS verified server-side.
   * For USER path: checked via JWT → is_workspace_member().
   * For INTERNAL path: accepted as server-provided scoping; still required.
   * NEVER trusted from browser payload alone.
   */
  workspaceId: string;

  /** Authenticated user ID derived from JWT. Absent for internal/cron paths. */
  userId?: string;

  /**
   * Auth path type.
   * - "public_unauthenticated": logged-out public caller (customer_support only, no workspace)
   * - "user_jwt": authenticated workspace user (JWT verified, workspace membership checked)
   * - "internal_service": server/cron call (internal secret verified, workspace required)
   */
  authContextType: "public_unauthenticated" | "user_jwt" | "internal_service";

  /** Application-level business use case (NOT an AI Router task type). */
  useCase: BusinessUseCase;

  /** Origin channel/source. */
  source: ChannelSource;

  /**
   * Lead/contact reference. Workspace ownership verified separately before dispatch.
   * Absent for non-customer-specific use cases (e.g., business_insight).
   */
  contactId?: string;

  /** Conversation/thread ID for continuity and correlation. */
  conversationId?: string;

  /** Locale/language code (e.g. "en", "sq"). Used to guide AI response language. */
  locale?: string;

  /** Structured input payload. At least one of text or structured should be present. */
  input: {
    text?: string;
    structured?: Record<string, unknown>;
  };
}

// ── Canonical response envelope ───────────────────────────────────────────────
export interface PulseAIResponse {
  /** Echoed correlation ID from request. Present even on error. */
  requestId: string;

  success: boolean;

  /** Echoed verified workspace ID. Empty string for public (no-workspace) paths. */
  workspaceId: string;

  /** Echoed business use case. */
  useCase: BusinessUseCase;

  /** Free-text answer/result from the selected capability. */
  answer?: string;

  /** Structured output data from the capability (e.g., NBA JSON). */
  structuredData?: unknown;

  /**
   * Confidence score 0–1. Only populated when the capability itself produces one.
   * NOT synthesized or estimated by the facade.
   */
  confidence?: number;

  /**
   * AI Router task type used for this request.
   * Distinct from the business use case (explicit separation per AI-2 spec).
   * Safe to expose to workspace callers as internal metadata.
   */
  routerTaskType?: string;

  /**
   * True when existing capability logic indicates uncertainty or escalation is needed.
   * The facade NEVER executes the handoff (no ticket creation, no messages sent).
   * Execution is AI-3 scope.
   */
  humanHandoffRecommended: boolean;

  /**
   * Suggested next action derived from the capability result.
   * This is a RECOMMENDATION ONLY — never executed by AI-2.
   * Execution (emails, bookings, CRM commercial writes) is AI-3 scope.
   */
  suggestedNextAction?: {
    type: string;
    reason: string;
  };

  /**
   * Usage metadata from AI Router where available.
   * Included for workspace-internal observability; never exposes API keys or secrets.
   */
  usageMetadata?: {
    provider?: string;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
  };

  /**
   * Normalized error code. No provider-specific codes; no raw provider response dumps.
   * Absent on success.
   */
  errorCode?: PulseAIErrorCode;

  /**
   * User-safe error message.
   * MUST NOT contain: API keys, internal secrets, service-role tokens,
   * raw provider response bodies, or stack traces.
   */
  errorMessage?: string;
}

// ── Use-case routing tables (explicit separation per spec) ────────────────────

/**
 * Business use case → AI Router task type.
 *
 * These are NOT the same concept. The facade decides which CAPABILITY to invoke;
 * the AI Router independently decides which provider chain to use.
 * Both mappings are explicit here so the distinction is never lost.
 */
export const USE_CASE_TO_ROUTER_TASK_TYPE: Readonly<Record<BusinessUseCase, string>> = {
  customer_evaluation: "complex_reasoning",   // Customer Brain uses complex reasoning internally
  segment_suggestion:  "complex_reasoning",
  business_insight:    "complex_reasoning",
  general_reasoning:   "balanced",
  complex_reasoning:   "complex_reasoning",
  lead_analysis:       "text_classification",
  customer_support:    "customer_support",
};

/**
 * Business use case → internal capability.
 *
 * The facade selects a CAPABILITY (customer_brain, ai_router_direct, public_support).
 * It NEVER selects a specific AI provider — that remains AI Router's responsibility.
 */
export const USE_CASE_TO_CAPABILITY: Readonly<Record<BusinessUseCase, InternalCapability>> = {
  customer_evaluation: "customer_brain",
  segment_suggestion:  "customer_brain",
  business_insight:    "ai_router_direct",
  general_reasoning:   "ai_router_direct",
  complex_reasoning:   "ai_router_direct",
  lead_analysis:       "ai_router_direct",
  customer_support:    "public_support",
};

// ── Pure helpers (zero network calls) ────────────────────────────────────────

/** Type guard: validates that a value is a supported BusinessUseCase. */
export function isSupportedUseCase(uc: unknown): uc is BusinessUseCase {
  return typeof uc === "string" &&
    (BUSINESS_USE_CASES as readonly string[]).includes(uc);
}

/**
 * True only for the public, no-workspace use cases.
 * Public use cases MUST NOT receive CRM, Customer Memory, or Business Memory data.
 */
export function isPublicUseCase(uc: BusinessUseCase): boolean {
  return uc === "customer_support";
}

/**
 * True for all use cases that require a verified workspace context.
 * Workspace ID must be verified via JWT membership check before dispatch.
 */
export function isWorkspaceUseCase(uc: BusinessUseCase): boolean {
  return !isPublicUseCase(uc);
}

/** Returns the AI Router task type for a given business use case. */
export function resolveRouterTaskType(uc: BusinessUseCase): string {
  return USE_CASE_TO_ROUTER_TASK_TYPE[uc];
}

/** Returns the internal capability responsible for a given business use case. */
export function resolveCapability(uc: BusinessUseCase): InternalCapability {
  return USE_CASE_TO_CAPABILITY[uc];
}

/**
 * Build a normalized error response.
 * humanHandoffRecommended is automatically set to true for router/provider failures,
 * indicating a human may need to assist — but the facade never executes the handoff.
 */
export function createErrorResponse(
  requestId: string,
  workspaceId: string,
  useCase: BusinessUseCase,
  code: PulseAIErrorCode,
  message: string,
): PulseAIResponse {
  return {
    requestId,
    success: false,
    workspaceId,
    useCase,
    humanHandoffRecommended:
      code === "ROUTER_UNAVAILABLE" || code === "PROVIDER_FAILURE_EXHAUSTED",
    errorCode: code,
    errorMessage: message,
  };
}

/**
 * Build a normalized success response.
 * Merges extra fields on top of the required skeleton.
 */
export function createSuccessResponse(
  requestId: string,
  workspaceId: string,
  useCase: BusinessUseCase,
  fields: Partial<
    Omit<PulseAIResponse, "requestId" | "success" | "workspaceId" | "useCase">
  >,
): PulseAIResponse {
  return {
    requestId,
    success: true,
    workspaceId,
    useCase,
    humanHandoffRecommended: false,
    ...fields,
  };
}
