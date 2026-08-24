import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type ProviderFailureCategory =
  | "RATE_LIMITED"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "AUTH_OR_CONFIG_FAILURE"
  | "TIMEOUT"
  | "TRANSIENT_PROVIDER_FAILURE"
  | "UNSUPPORTED_REQUEST"
  | "PERMANENT_PROVIDER_FAILURE";

type HealthRow = {
  provider_key: string;
  status: string;
  cooldown_until: string | null;
  quota_exhausted_until: string | null;
};

type UsageStart = {
  requestId: string;
  workspaceId: string | null;
  userId: string | null;
  authContext: "user" | "internal" | "public";
  taskType: string;
  explicitProviderKey?: string | null;
};

type UsageAttempt = {
  requestId: string;
  providerKey: string;
  providerName: string;
  attemptIndex: number;
  success: boolean;
  failureCategory?: ProviderFailureCategory | null;
  errorCode?: string | null;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
};

type UsageFinish = {
  requestId: string;
  status: "succeeded" | "failed" | "blocked";
  successfulProviderKey?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  creditsUsed?: number;
  latencyMs?: number | null;
  fallbackUsed?: boolean;
  totalProviderAttempts?: number;
  errorCode?: string | null;
};

function future(value: string | null | undefined, nowMs: number): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > nowMs;
}

export function isDurablyUnavailable(row: HealthRow, nowMs = Date.now()): boolean {
  if (row.status === "disabled") return true;
  if (future(row.quota_exhausted_until, nowMs)) return true;
  if (future(row.cooldown_until, nowMs)) return true;
  return false;
}

export async function loadDurablyUnavailableProviders(
  supabase: SupabaseClient,
  providerKeys: readonly string[],
): Promise<Set<string>> {
  if (!providerKeys.length) return new Set();

  const { data, error } = await supabase
    .from("ai_provider_health")
    .select("provider_key,status,cooldown_until,quota_exhausted_until")
    .in("provider_key", [...providerKeys]);

  if (error) {
    // Deployment compatibility: router remains operational if the candidate
    // migration has not been applied yet. The rollout gate must still deploy
    // migrations before relying on durable health as authoritative state.
    console.warn("[ai-router] durable provider health unavailable:", error.code ?? "query_error");
    return new Set();
  }

  const unavailable = new Set<string>();
  for (const row of (data ?? []) as HealthRow[]) {
    if (isDurablyUnavailable(row)) unavailable.add(row.provider_key);
  }
  return unavailable;
}

export async function startAiUsageRequest(
  supabase: SupabaseClient,
  input: UsageStart,
): Promise<void> {
  const { error } = await supabase.from("ai_usage_requests").insert({
    id: input.requestId,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    auth_context: input.authContext,
    task_type: input.taskType,
    explicit_provider_key: input.explicitProviderKey ?? null,
    request_status: "pending",
  });
  if (error) console.warn("[ai-router] usage request start failed:", error.code ?? "insert_error");
}

export async function recordAiProviderAttempt(
  supabase: SupabaseClient,
  input: UsageAttempt,
): Promise<void> {
  const { error } = await supabase.from("ai_provider_attempts").insert({
    request_id: input.requestId,
    provider_key: input.providerKey,
    provider_name: input.providerName,
    attempt_index: input.attemptIndex,
    success: input.success,
    failure_category: input.failureCategory ?? null,
    error_code: input.errorCode ?? null,
    latency_ms: input.latencyMs,
    tokens_in: input.tokensIn ?? 0,
    tokens_out: input.tokensOut ?? 0,
    cost_usd: input.costUsd ?? 0,
  });
  if (error) console.warn("[ai-router] provider attempt ledger failed:", error.code ?? "insert_error");
}

export async function recordDurableProviderSuccess(
  supabase: SupabaseClient,
  providerKey: string,
  latencyMs: number,
): Promise<void> {
  const { error } = await supabase.rpc("record_ai_provider_success", {
    p_provider_key: providerKey,
    p_latency_ms: latencyMs,
  });
  if (error) console.warn("[ai-router] provider health success write failed:", error.code ?? "rpc_error");
}

export async function recordDurableProviderFailure(
  supabase: SupabaseClient,
  providerKey: string,
  failureCategory: ProviderFailureCategory,
  errorCode: string | null,
  latencyMs: number,
): Promise<void> {
  const { error } = await supabase.rpc("record_ai_provider_failure", {
    p_provider_key: providerKey,
    p_failure_category: failureCategory,
    p_error_code: errorCode,
    p_latency_ms: latencyMs,
  });
  if (error) console.warn("[ai-router] provider health failure write failed:", error.code ?? "rpc_error");
}

export async function finishAiUsageRequest(
  supabase: SupabaseClient,
  input: UsageFinish,
): Promise<void> {
  const { error } = await supabase.from("ai_usage_requests").update({
    request_status: input.status,
    successful_provider_key: input.successfulProviderKey ?? null,
    tokens_in: input.tokensIn ?? 0,
    tokens_out: input.tokensOut ?? 0,
    cost_usd: input.costUsd ?? 0,
    credits_used: input.creditsUsed ?? 0,
    latency_ms: input.latencyMs ?? null,
    fallback_used: input.fallbackUsed ?? false,
    total_provider_attempts: input.totalProviderAttempts ?? 0,
    error_code: input.errorCode ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", input.requestId);
  if (error) console.warn("[ai-router] usage request finish failed:", error.code ?? "update_error");
}

export function safeProviderErrorCode(message: string): string | null {
  const status = message.match(/\((\d{3})\)/)?.[1];
  if (status) return status;
  if (message.toLowerCase().includes("timeout")) return "TIMEOUT";
  if (message.toLowerCase().includes("api key not configured")) return "MISSING_KEY";
  return null;
}
