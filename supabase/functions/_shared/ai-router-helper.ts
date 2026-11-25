import { getServiceKey } from "./admin-client.ts";

type RouterMessage = { role: string; content: string | Array<unknown> };

type CallAIRouterOptions = {
  taskType?: string;
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
  maxTokens?: number;
  preferCheap?: boolean;
  allowInternalNoWorkspace?: boolean;
};

/**
 * Full ai-router result, including the observability fields the plain
 * `callAIRouter` drops. `requestId` is `ai_usage_requests.id` and is what makes
 * an AI reply traceable from the inbound message all the way to the provider
 * attempt without building a second ledger.
 */
export type AIRouterResult = {
  text: string;
  requestId: string | null;
  provider: string | null;
  providerKey: string | null;
  taskType: string | null;
  fallbackUsed: boolean;
  totalAttempts: number | null;
};

async function postToRouter(
  messages: RouterMessage[],
  systemPrompt: string,
  options: CallAIRouterOptions,
): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL missing");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.authHeader) {
    headers.Authorization = options.authHeader;
  } else {
    headers.Authorization = ["Bearer", getServiceKey()].join(" ");
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (internalSecret) headers["x-internal-secret"] = internalSecret;
  }

  const payload: Record<string, unknown> = {
    task_type: options.taskType ?? "balanced",
    messages,
    system_prompt: systemPrompt,
    max_tokens: options.maxTokens ?? 500,
  };

  if (options.workspaceId) payload.workspace_id = options.workspaceId;
  if (options.userId) payload.user_id = options.userId;
  if (options.preferCheap !== undefined) payload.prefer_cheap = options.preferCheap;
  if (options.allowInternalNoWorkspace) payload.internal_system_task = true;

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-router`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let code = "";
    let message = "";
    try {
      const err = await res.json() as Record<string, unknown>;
      code = String(err.code ?? "");
      message = String(err.error ?? "");
    } catch {
      // noop
    }
    throw new Error(`ai-router ${res.status}${code ? ` ${code}` : ""}${message ? `: ${message}` : ""}`);
  }

  return await res.json() as Record<string, unknown>;
}

function extractText(data: Record<string, unknown>): string {
  return String(
    data.response ??
    data.content ??
    data.text ??
    "",
  );
}

/**
 * Unchanged contract: returns only the assistant text and throws on failure.
 * Existing callers keep working exactly as before.
 */
export async function callAIRouter(
  messages: RouterMessage[],
  systemPrompt: string,
  options: CallAIRouterOptions = {},
): Promise<string> {
  const data = await postToRouter(messages, systemPrompt, options);
  return extractText(data);
}

/**
 * Same call, but keeps the routing metadata. Use this wherever the result has
 * to be auditable (inbound AI replies, metering linkage).
 */
export async function callAIRouterDetailed(
  messages: RouterMessage[],
  systemPrompt: string,
  options: CallAIRouterOptions = {},
): Promise<AIRouterResult> {
  const data = await postToRouter(messages, systemPrompt, options);
  const attempts = Number(data.total_attempts);
  return {
    text: extractText(data),
    requestId: typeof data.request_id === "string" ? data.request_id : null,
    provider: typeof data.provider === "string" ? data.provider : null,
    providerKey: typeof data.provider_key === "string" ? data.provider_key : null,
    taskType: typeof data.task_type === "string" ? data.task_type : null,
    fallbackUsed: data.fallback_used === true,
    totalAttempts: Number.isFinite(attempts) ? attempts : null,
  };
}
