// supabase/functions/ai-router/index.ts
// ============================================================
// PULSE AI — Intelligent Multi-Provider AI Router  (AI-1A3)
// 14 providers · Task classification · Multi-chain failover
// Same-context continuity · Bounded retry · Cost-aware ordering
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  finishAiUsageRequest,
  loadDurablyUnavailableProviders,
  recordAiProviderAttempt,
  recordDurableProviderFailure,
  recordDurableProviderSuccess,
  safeProviderErrorCode,
  startAiUsageRequest,
  type ProviderFailureCategory as DurableProviderFailureCategory,
} from "../_shared/ai-provider-governance.ts";
import {
  classifyProviderFailure,
  executeWithFailover,
  FailoverExhaustedError,
  isEligibleForProviderFailover,
  ProviderAttemptResult,
  recordProviderCooldown,
} from "../_shared/failover-router.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── PROVIDER REGISTRY ─────────────────────────────────────────
const PROVIDERS = {
  // Cheap & fast — 80% of traffic
  GROQ_LLAMA8B: {
    name: "Groq Llama 3.1 8B", costIn: 0.05, costOut: 0.08,
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant", keyEnv: "GROQ_API_KEY", type: "openai_compat",
  },
  LOVABLE_FLASH: {
    name: "Lovable AI Gateway", costIn: 0, costOut: 0,
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    model: "google/gemini-3-flash-preview", keyEnv: "LOVABLE_API_KEY", type: "openai_compat",
  },
  DEEPSEEK_FLASH: {
    name: "DeepSeek V4 Flash", costIn: 0.14, costOut: 0.28,
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-flash", keyEnv: "DEEPSEEK_API_KEY", type: "openai_compat",
  },
  MISTRAL_SMALL: {
    name: "Mistral Small 4", costIn: 0.15, costOut: 0.60,
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest", keyEnv: "MISTRAL_API_KEY", type: "openai_compat",
  },
  GROK_FAST: {
    name: "Grok 4.1 Fast", costIn: 0.20, costOut: 0.50,
    endpoint: "https://api.x.ai/v1/chat/completions",
    model: "grok-3-fast", keyEnv: "GROK_API_KEY", type: "openai_compat",
  },
  // Mid-tier — 15% of traffic
  GPT_MINI: {
    name: "GPT-4o-mini", costIn: 0.15, costOut: 0.60,
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini", keyEnv: "OPENAI_API_KEY", type: "openai_compat",
  },
  GEMINI_FLASH: {
    name: "Gemini 2.5 Flash Lite", costIn: 0.10, costOut: 0.40,
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash-lite", keyEnv: "GEMINI_API_KEY", type: "openai_compat",
  },
  DEEPSEEK_PRO: {
    name: "DeepSeek V4 Pro", costIn: 0.435, costOut: 0.87,
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-pro", keyEnv: "DEEPSEEK_API_KEY", type: "openai_compat",
  },
  // Premium — 5% of traffic
  CLAUDE_SONNET: {
    name: "Claude Sonnet 4.6", costIn: 3.00, costOut: 15.00,
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-20250514", keyEnv: "ANTHROPIC_API_KEY", type: "anthropic",
  },
  GPT4O: {
    name: "GPT-4o", costIn: 2.50, costOut: 15.00,
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o", keyEnv: "OPENAI_API_KEY", type: "openai_compat",
  },
  PERPLEXITY: {
    name: "Perplexity Sonar", costIn: 3.00, costOut: 15.00,
    endpoint: "https://api.perplexity.ai/chat/completions",
    model: "sonar-pro", keyEnv: "PERPLEXITY_API_KEY", type: "openai_compat",
  },
  GROQ_LLAMA70B: {
    name: "Groq Llama 3.3 70B", costIn: 0.59, costOut: 0.79,
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile", keyEnv: "GROQ_API_KEY", type: "openai_compat",
  },
  // ── Kimi / Moonshot ──────────────────────────────────────────────────────
  KIMI: {
    name: "Kimi (Moonshot AI)",
    costIn: 0.15, costOut: 0.60,
    endpoint: "https://api.moonshot.ai/v1/chat/completions",
    model: "kimi-k2-5.5-preview",
    keyEnv: "KIMI_API_KEY",
    keyEnvFallback: "MOONSHOT_API_KEY",
    modelEnvOverride: "KIMI_MODEL",
    type: "openai_compat",
    timeoutMs: 30_000,
  },
  // ── Z.ai ─────────────────────────────────────────────────────────────────
  ZAI: {
    name: "Z.ai",
    costIn: 0.20, costOut: 0.60,
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    model: "glm-4.7-flash",
    keyEnv: "ZAI_API_KEY",
    modelEnvOverride: "ZAI_MODEL",
    endpointEnvOverride: "ZAI_BASE_URL",
    type: "openai_compat",
    timeoutMs: 30_000,
  },
  // ── Replicate ─────────────────────────────────────────────────────────────
  REPLICATE: {
    name: "Replicate",
    costIn: 0.05, costOut: 0.25,
    endpoint: "https://api.replicate.com/v1/models",
    model: "meta/meta-llama-3-8b-instruct",
    keyEnv: "REPLICATE_API_TOKEN",
    modelEnvOverride: "REPLICATE_MODEL",
    type: "replicate",
    timeoutMs: 60_000,
  },
} as const;

// ── ROUTING DECISION MATRIX ───────────────────────────────────
type TaskType =
  | "simple_chat" | "high_volume" | "balanced" | "complex_reasoning"
  | "coding" | "web_research" | "rag" | "multimodal" | "multilingual"
  | "sales_reply" | "marketing_copy" | "customer_support";

const CANONICAL_TASK_TYPES: readonly TaskType[] = [
  "simple_chat", "high_volume", "balanced", "complex_reasoning",
  "coding", "web_research", "rag", "multimodal", "multilingual",
  "sales_reply", "marketing_copy", "customer_support",
];

const TASK_TYPE_ALIASES: Readonly<Record<string, TaskType>> = {
  brain: "complex_reasoning",
  voice_ai: "high_volume",
  text_classification: "balanced",
  multimodal_vision: "multimodal",
};

function normalizeTaskType(taskType?: string): TaskType | null {
  if (!taskType) return null;
  const normalized = taskType.trim().toLowerCase();
  if ((CANONICAL_TASK_TYPES as readonly string[]).includes(normalized)) return normalized as TaskType;
  return TASK_TYPE_ALIASES[normalized] ?? null;
}

// ── MULTI-PROVIDER ROUTE CHAINS ───────────────────────────────
// Each task type has an ordered candidate chain (capability → quality → cost).
// Ordering: primary (best capability fit) → capable alternatives → cheap safety nets.
// No provider appears twice in any chain.
type ProviderKey = keyof typeof PROVIDERS;

// Providers with a documented free allowance are always attempted before paid providers.
// "free allowance" is intentionally not the same as zero cost: once an account is upgraded,
// the provider may bill usage. The platform-wide paid budget below is therefore still enforced.
const FREE_ALLOWANCE_PROVIDERS = new Set<ProviderKey>([
  "LOVABLE_FLASH", "GROQ_LLAMA8B", "GROQ_LLAMA70B", "GEMINI_FLASH",
]);

function paidFallbackConfig() {
  const enabled = (Deno.env.get("AI_PAID_FALLBACK_ENABLED") ?? "true").toLowerCase() === "true";
  const parsedBudget = Number(Deno.env.get("AI_PAID_DAILY_BUDGET_USD") ?? "1.00");
  const dailyBudgetUsd = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 0;
  return { enabled, dailyBudgetUsd };
}

async function canUsePaidFallback(supabase: ReturnType<typeof createClient>): Promise<{
  allowed: boolean;
  dailyBudgetUsd: number;
  spentTodayUsd: number;
  reason?: string;
}> {
  const { enabled, dailyBudgetUsd } = paidFallbackConfig();
  if (!enabled || dailyBudgetUsd <= 0) {
    return { allowed: false, dailyBudgetUsd, spentTodayUsd: 0, reason: "PAID_FALLBACK_DISABLED" };
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage_requests")
    .select("successful_provider_key,cost_usd")
    .eq("request_status", "succeeded")
    .gte("completed_at", startOfDay.toISOString());

  // Fail closed: paid calls must never run without an authoritative spend ledger.
  if (error) {
    console.warn("[ai-router] paid fallback blocked: usage ledger unavailable", error.code ?? "query_error");
    return { allowed: false, dailyBudgetUsd, spentTodayUsd: 0, reason: "SPEND_LEDGER_UNAVAILABLE" };
  }

  const spentTodayUsd = (data ?? []).reduce((sum, row) => {
    const providerKey = row.successful_provider_key as ProviderKey | null;
    if (providerKey && FREE_ALLOWANCE_PROVIDERS.has(providerKey)) return sum;
    return sum + Number(row.cost_usd ?? 0);
  }, 0);
  return {
    allowed: spentTodayUsd < dailyBudgetUsd,
    dailyBudgetUsd,
    spentTodayUsd,
    ...(spentTodayUsd >= dailyBudgetUsd ? { reason: "DAILY_PAID_BUDGET_REACHED" } : {}),
  };
}

const ROUTE_CHAINS: Record<TaskType, {
  chain: readonly ProviderKey[];
  tier: "cheap" | "mid" | "premium";
}> = {
  // Short messages — latency matters, any fast provider works
  simple_chat: {
    chain: ["GROQ_LLAMA8B", "DEEPSEEK_FLASH", "MISTRAL_SMALL", "GEMINI_FLASH", "GPT_MINI"],
    tier: "cheap",
  },
  // Very high volume, lowest cost first
  high_volume: {
    chain: ["DEEPSEEK_FLASH", "GROQ_LLAMA8B", "MISTRAL_SMALL", "GEMINI_FLASH", "GPT_MINI"],
    tier: "cheap",
  },
  // General balanced tasks — mid-tier starts
  balanced: {
    chain: ["MISTRAL_SMALL", "GPT_MINI", "DEEPSEEK_FLASH", "GROQ_LLAMA8B", "GEMINI_FLASH"],
    tier: "cheap",
  },
  // Requires strong reasoning — premium first, capable fallbacks
  complex_reasoning: {
    chain: ["CLAUDE_SONNET", "GPT4O", "GROQ_LLAMA70B", "DEEPSEEK_PRO", "GPT_MINI"],
    tier: "premium",
  },
  // Coding — accuracy critical, premium models lead
  coding: {
    chain: ["CLAUDE_SONNET", "GPT4O", "DEEPSEEK_PRO", "GROQ_LLAMA70B", "MISTRAL_SMALL"],
    tier: "premium",
  },
  // Web research — grounded/search-capable first
  web_research: {
    chain: ["PERPLEXITY", "GEMINI_FLASH", "GPT4O", "GROQ_LLAMA70B", "MISTRAL_SMALL"],
    tier: "premium",
  },
  // RAG — needs context window & quality
  rag: {
    chain: ["DEEPSEEK_PRO", "CLAUDE_SONNET", "MISTRAL_SMALL", "GPT_MINI", "DEEPSEEK_FLASH"],
    tier: "mid",
  },
  // Multimodal — vision-capable first
  multimodal: {
    chain: ["GEMINI_FLASH", "GPT4O", "CLAUDE_SONNET", "GPT_MINI", "MISTRAL_SMALL"],
    tier: "mid",
  },
  // Multilingual — strong multilingual models first
  multilingual: {
    chain: ["DEEPSEEK_FLASH", "MISTRAL_SMALL", "KIMI", "GPT_MINI", "GROQ_LLAMA8B"],
    tier: "cheap",
  },
  // Sales replies — persuasive but fast
  sales_reply: {
    chain: ["MISTRAL_SMALL", "GROQ_LLAMA70B", "GPT_MINI", "DEEPSEEK_FLASH", "GEMINI_FLASH"],
    tier: "cheap",
  },
  // Marketing copy — creative quality matters
  marketing_copy: {
    chain: ["CLAUDE_SONNET", "GPT4O", "MISTRAL_SMALL", "GROQ_LLAMA70B", "GPT_MINI"],
    tier: "premium",
  },
  // Customer support — reliability + quality
  customer_support: {
    chain: ["LOVABLE_FLASH", "GROQ_LLAMA8B", "MISTRAL_SMALL", "DEEPSEEK_FLASH", "GPT_MINI"],
    tier: "cheap",
  },
};

// ── RETRY BUDGET ──────────────────────────────────────────────
// Per-provider: max 1 retry for transient issues (bounded, low latency impact)
// Total failover: max 5 provider candidates per request (chain length above caps this)
const PER_PROVIDER_MAX_RETRIES = 1;   // same-provider retry
const TOTAL_PROVIDER_BUDGET = 5;      // cross-provider failover (max chain length)

// ── TASK CLASSIFIER ───────────────────────────────────────────
function classifyTask(
  prompt: string,
  options: { planTier?: string; preferCheap?: boolean },
): TaskType {
  const p = prompt.toLowerCase();
  if (/function|class|import|def |const |var |let |sql|query|code|script|api|endpoint|bug|error|typescript|python|javascript/.test(p)) return "coding";
  if (/search|find|latest|current|today|news|2026|price of|who is|what is/.test(p)) return "web_research";
  if (/analyze|strategy|compare|explain|reasoning|step by step|why|because|proof|thesis/.test(p) && p.length > 200) return "complex_reasoning";
  if (/write|create|generate|post|caption|email|newsletter|ad|campaign|marketing/.test(p) && p.length > 50) return "marketing_copy";
  if (/customer|client|complaint|help|support|problem|issue|how do i/.test(p)) return "customer_support";
  if (/price|cost|offer|discount|buy|purchase|interested|quote/.test(p)) return "sales_reply";
  if (p.length < 100 && options.preferCheap) return "high_volume";
  if (options.planTier === "starter" || options.planTier === "free") return "balanced";
  return "balanced";
}

// ── CALL PROVIDER ─────────────────────────────────────────────
async function callProvider(
  providerKey: ProviderKey,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  apiKeys: Record<string, string>,
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }> {
  const p = PROVIDERS[providerKey] as typeof PROVIDERS[ProviderKey] & {
    keyEnvFallback?: string;
    modelEnvOverride?: string;
    endpointEnvOverride?: string;
    timeoutMs?: number;
  };

  const apiKey = apiKeys[p.keyEnv]
    ?? Deno.env.get(p.keyEnv)
    ?? (p.keyEnvFallback ? Deno.env.get(p.keyEnvFallback) : undefined);
  if (!apiKey) {
    // Missing key = AUTH_OR_CONFIG_FAILURE — eligible for failover to next provider
    throw new Error(`${p.name}: permanent_failure (auth) API key not configured: ${p.keyEnv}`);
  }

  const model = p.modelEnvOverride ? (Deno.env.get(p.modelEnvOverride) ?? p.model) : p.model;
  const endpoint = (p.endpointEnvOverride ? Deno.env.get(p.endpointEnvOverride) : null) ?? p.endpoint;
  const timeoutMs = p.timeoutMs ?? 25_000;

  if (p.type === "replicate") {
    return await callProviderReplicate(apiKey, model, messages, systemPrompt, maxTokens, p.timeoutMs ?? 60_000);
  }

  if (p.type === "anthropic") {
    return await callWithRetry(
      providerKey as string, p.name, timeoutMs, PER_PROVIDER_MAX_RETRIES,
      async (ctrl) => {
        const res = await fetch(p.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system: systemPrompt,
            messages: messages.filter(m => m.role !== "system"),
          }),
          signal: ctrl.signal,
        });
        return await parseProviderResponse(p.name, res, "anthropic");
      },
    );
  }

  // OpenAI-compatible
  const allMessages = [
    { role: "system", content: systemPrompt },
    ...messages.filter(m => m.role !== "system"),
  ];
  return await callWithRetry(
    providerKey as string, p.name, timeoutMs, PER_PROVIDER_MAX_RETRIES,
    async (ctrl) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: allMessages, max_tokens: maxTokens, temperature: 0.7 }),
        signal: ctrl.signal,
      });
      return await parseProviderResponse(p.name, res, "openai_compat");
    },
  );
}

/**
 * Bounded per-provider retry.
 * - Transient (429, 5xx, timeout): retry up to maxRetries.
 * - Permanent (400/401/402/403): throw immediately — no retry, no further chain for malformed requests.
 */
async function callWithRetry(
  providerKey: string,
  providerName: string,
  timeoutMs: number,
  maxRetries: number,
  attemptFn: (ctrl: AbortController) => Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }>,
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }> {
  let lastErr: Error = new Error("unreachable");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const result = await attemptFn(ctrl);
      clearTimeout(timer);
      return result;
    } catch (e: any) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === "AbortError") {
        lastErr = new Error(`${providerName}: timeout after ${timeoutMs}ms`);
        if (attempt < maxRetries) continue;
        throw lastErr;
      }
      // Permanent failure — propagate immediately (no retry, no further chain for malformed)
      if (msg.includes("permanent_failure") || msg.includes("UNSUPPORTED_REQUEST")) throw e instanceof Error ? e : new Error(msg);
      lastErr = e instanceof Error ? e : new Error(msg);
      if (attempt < maxRetries) {
        // Honor Retry-After when available
        const ra = msg.match(/retry.after[:\s]+(\d+)/i);
        const backoffMs = ra ? Math.min(parseInt(ra[1], 10) * 1000, 8_000) : 1_200 * (attempt + 1);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

async function parseProviderResponse(
  providerName: string,
  res: Response,
  format: "anthropic" | "openai_compat",
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }> {
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 401 || res.status === 402 || res.status === 403) {
      throw new Error(`${providerName}: permanent_failure (${res.status})`);
    }
    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      throw new Error(`${providerName}: rate_limited (429)${ra ? ` retry-after: ${ra}` : ""}`);
    }
    if (res.status >= 500) {
      throw new Error(`${providerName}: provider_error (${res.status})`);
    }
    throw new Error(`${providerName}: http_error (${res.status})`);
  }
  const d = await res.json() as Record<string, unknown>;
  if (format === "anthropic") {
    const content = d.content as Array<{ text?: string }> | undefined;
    const usage = d.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    return {
      text: content?.[0]?.text ?? "",
      tokensIn: usage?.input_tokens ?? 0,
      tokensOut: usage?.output_tokens ?? 0,
    };
  }
  const choices = d.choices as Array<{ message?: { content?: string } }> | undefined;
  const usage = d.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return {
    text: choices?.[0]?.message?.content ?? "",
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
    modelUsed: typeof d.model === "string" ? d.model : undefined,
  };
}

// ── REPLICATE ASYNC PREDICTION HANDLER ───────────────────────
async function callProviderReplicate(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }> {
  const headers = {
    "Authorization": `Token ${apiKey}`,
    "Content-Type": "application/json",
    "Prefer": "wait",
  };

  function buildLlama3Prompt(msgs: Array<{ role: string; content: string }>, sys: string): string {
    let p = sys ? "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n" + sys + "<|eot_id|>" : "<|begin_of_text|>";
    for (const m of msgs.filter(x => x.role !== "system")) {
      const role = m.role === "assistant" ? "assistant" : "user";
      p += "<|start_header_id|>" + role + "<|end_header_id|>\n\n" + m.content + "<|eot_id|>";
    }
    p += "<|start_header_id|>assistant<|end_header_id|>\n\n";
    return p;
  }

  const prompt = buildLlama3Prompt(messages, systemPrompt);
  const repBody = JSON.stringify({
    input: { prompt, system_prompt: systemPrompt || undefined, max_tokens: maxTokens, temperature: 0.01 },
  });

  let createRes!: Response;
  let repLastErr: Error = new Error("unreachable");
  for (let repAttempt = 0; repAttempt <= PER_PROVIDER_MAX_RETRIES; repAttempt++) {
    createRes = await fetch(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      { method: "POST", headers, body: repBody, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (createRes.ok) break;
    const errText = await createRes.text().catch(() => "");
    if ([400, 401, 402, 403, 422].includes(createRes.status)) {
      throw new Error(`Replicate: permanent_failure (${createRes.status})`);
    }
    if (createRes.status === 429) {
      repLastErr = new Error(`Replicate: rate_limited (429)`);
      if (repAttempt < PER_PROVIDER_MAX_RETRIES) {
        const ra = parseInt(createRes.headers.get("Retry-After") ?? "2", 10);
        await new Promise(r => setTimeout(r, Math.min(ra * 1000, 8000)));
        continue;
      }
      throw repLastErr;
    }
    if (createRes.status >= 500) {
      repLastErr = new Error(`Replicate: provider_error (${createRes.status})`);
      if (repAttempt < PER_PROVIDER_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500 * (repAttempt + 1)));
        continue;
      }
      throw repLastErr;
    }
    throw new Error(`Replicate: create_failed (${createRes.status})`);
  }
  if (!createRes.ok) throw repLastErr;

  const prediction = await createRes.json() as Record<string, unknown>;
  if (prediction.status === "succeeded") {
    const output = Array.isArray(prediction.output) ? prediction.output.join("") : (prediction.output ?? "");
    return { text: String(output).trim(), tokensIn: 0, tokensOut: 0, modelUsed: model };
  }
  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new Error(`Replicate: prediction ${prediction.status}`);
  }

  const predId = prediction.id as string;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1_500));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predId}`,
      { headers: { "Authorization": `Token ${apiKey}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!pollRes.ok) break;
    const poll = await pollRes.json() as Record<string, unknown>;
    if (poll.status === "succeeded") {
      const output = Array.isArray(poll.output) ? poll.output.join("") : (poll.output ?? "");
      return { text: String(output).trim(), tokensIn: 0, tokensOut: 0, modelUsed: model };
    }
    if (poll.status === "failed" || poll.status === "canceled") {
      throw new Error(`Replicate: prediction ${poll.status}`);
    }
  }
  throw new Error(`Replicate: timeout after ${timeoutMs}ms`);
}

// ── BILLING HELPERS ───────────────────────────────────────────
async function incrementAiReplies(
  supabase: ReturnType<typeof createClient>,
  ctx: { userId: string; newDay: boolean; effectiveUsed: number },
): Promise<void> {
  const newVal = ctx.newDay ? 1 : ctx.effectiveUsed + 1;
  const upd: Record<string, unknown> = { ai_replies_today: newVal };
  if (ctx.newDay) upd.ai_replies_reset_at = new Date().toISOString();
  const { error } = await supabase.from("subscriptions").update(upd).eq("user_id", ctx.userId);
  if (error) console.error("[ai-router] increment ai_replies failed:", error.message);
}

function failureCategoryForGovernance(error: unknown): DurableProviderFailureCategory {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\((\d{3})\)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
  return classifyProviderFailure(status, message) as DurableProviderFailureCategory;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  const bearerToken = authHeader.slice("Bearer ".length).trim();
  const isInternal = (() => {
    const secret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    return !!secret && req.headers.get("x-internal-secret") === secret;
  })();

  if (!isInternal && bearerToken === getServiceKey()) {
    return json({
      error: "Unauthorized: service-role bearer requires x-internal-secret",
      code: "SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET",
    }, 401);
  }

  const { data: { user } } = isInternal
    ? { data: { user: null } }
    : await supabase.auth.getUser(bearerToken);

  if (!isInternal && !user) return json({ error: "Unauthorized" }, 401);

  let body: {
    messages: Array<{ role: string; content: string }>;
    system_prompt?: string;
    system?: string;
    task_type?: string;
    max_tokens?: number;
    workspace_id?: string;
    prefer_cheap?: boolean;
    plan_tier?: string;
    provider?: string;
    internal_system_task?: boolean;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  const {
    messages, system_prompt: bodySystemPrompt, system: bodySystem,
    task_type, max_tokens = 800, workspace_id, prefer_cheap = false,
    provider: explicitProvider, internal_system_task,
  } = body;

  const system_prompt = bodySystemPrompt ?? bodySystem ?? "";

  if (!messages?.length) return json({ error: "messages janë të detyrueshme" }, 400);

  const normalizedTaskType = normalizeTaskType(task_type);
  if (task_type && !normalizedTaskType) {
    return json({
      error: `Unknown task_type "${task_type}"`,
      code: "UNSUPPORTED_TASK_TYPE",
      supported_task_types: CANONICAL_TASK_TYPES.join(", "),
      aliases: Object.keys(TASK_TYPE_ALIASES).join(", "),
    }, 400);
  }

  // Server-side plan tier — never trust client-supplied plan_tier
  const plan_tier = "growth";

  // Workspace isolation
  const authorizedWorkspaceId = await (async () => {
    if (isInternal) return workspace_id ?? null;
    if (!user) return null;
    if (!workspace_id) {
      const { data: ownedWs } = await supabase.from("workspaces")
        .select("id").eq("owner_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (ownedWs?.id) return ownedWs.id;
      const { data: memWs } = await supabase.from("workspace_members")
        .select("workspace_id").eq("user_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (memWs?.workspace_id) return memWs.workspace_id;
      return null;
    }
    const { data: member } = await supabase.rpc("is_workspace_member",
      { _user_id: user.id, _workspace_id: workspace_id });
    const { data: owned } = await supabase.from("workspaces")
      .select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle();
    if (!member && !owned) return null;
    return workspace_id;
  })();

  const allowInternalNoWorkspaceCustomerSupport =
    isInternal && normalizedTaskType === "customer_support" && !workspace_id;
  const allowInternalSystemTask = isInternal && internal_system_task === true && !workspace_id;
  if (!authorizedWorkspaceId && !allowInternalNoWorkspaceCustomerSupport && !allowInternalSystemTask) {
    return json({ error: "Forbidden: not a member of workspace" }, 403);
  }

  // ── CUSTOMER ENTITLEMENT CHECK ────────────────────────────────
  // Must be checked BEFORE any provider call.
  // Customer Pulse AI quota exhaustion → STOP. No provider failover.
  let limitCtx: { userId: string; newDay: boolean; effectiveUsed: number; dailyLimit: number } | null = null;
  if (!isInternal && user) {
    const today = new Date().toDateString();
    const { data: sub } = await supabase.from("subscriptions")
      .select("plan,ai_replies_today,ai_replies_reset_at")
      .eq("user_id", user.id).maybeSingle();
    if (sub) {
      const PLAN_MAP: Record<string, string> = { free: "standard", basic: "standard" };
      const resolvedPlan = PLAN_MAP[sub.plan ?? ""] ?? (sub.plan || "standard");
      const { data: pr } = await supabase.from("pricing_settings")
        .select("ai_replies_per_day_limit").eq("plan_key", resolvedPlan).maybeSingle();
      let pricingRow = pr;
      if (!pricingRow) {
        const { data: std } = await supabase.from("pricing_settings")
          .select("ai_replies_per_day_limit").eq("plan_key", "standard").maybeSingle();
        pricingRow = std;
      }
      const dailyLimit = pricingRow?.ai_replies_per_day_limit ?? 50;
      const resetAt = sub.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at).toDateString() : null;
      const newDay = resetAt !== today;
      const effectiveUsed = newDay ? 0 : (sub.ai_replies_today ?? 0);
      if (effectiveUsed >= dailyLimit) {
        return json({
          error: "Daily AI reply limit reached. Upgrade for more AI replies.",
          limit: dailyLimit, current: effectiveUsed, allowed: false,
        }, 429);
      }
      limitCtx = { userId: user.id, newDay, effectiveUsed, dailyLimit };
    }
  }

  const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
  const resolvedTaskType = normalizedTaskType ?? classifyTask(lastUserMsg, { planTier: plan_tier, preferCheap: prefer_cheap });
  const usageRequestId = crypto.randomUUID();
  const usageTaskType = explicitProvider ? (normalizedTaskType ?? "explicit_provider") : resolvedTaskType;

  await startAiUsageRequest(supabase, {
    requestId: usageRequestId,
    workspaceId: authorizedWorkspaceId,
    userId: user?.id ?? null,
    authContext: isInternal ? "internal" : "user",
    taskType: usageTaskType,
    explicitProviderKey: explicitProvider ?? null,
  });

  let providerAttemptIndex = 0;
  let paidFallbackDecision: Awaited<ReturnType<typeof canUsePaidFallback>> | null = null;
  const governedProviderCall = async (providerKey: ProviderKey) => {
    if (!FREE_ALLOWANCE_PROVIDERS.has(providerKey)) {
      paidFallbackDecision ??= await canUsePaidFallback(supabase);
      if (!paidFallbackDecision.allowed) {
        throw new Error(`Paid fallback blocked: ${paidFallbackDecision.reason ?? "budget policy"}`);
      }
    }
    const attemptIndex = ++providerAttemptIndex;
    const attemptStart = Date.now();
    const providerDef = PROVIDERS[providerKey];
    try {
      const result = await callProvider(providerKey, messages, system_prompt, max_tokens, {});
      const latencyMs = Date.now() - attemptStart;
      const costUsd = (result.tokensIn / 1_000_000 * providerDef.costIn) +
        (result.tokensOut / 1_000_000 * providerDef.costOut);
      await recordDurableProviderSuccess(supabase, providerKey, latencyMs);
      await recordAiProviderAttempt(supabase, {
        requestId: usageRequestId,
        providerKey,
        providerName: providerDef.name,
        attemptIndex,
        success: true,
        latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd,
      });
      return result;
    } catch (error: unknown) {
      const latencyMs = Date.now() - attemptStart;
      const message = error instanceof Error ? error.message : String(error);
      const failureCategory = failureCategoryForGovernance(error);
      const errorCode = safeProviderErrorCode(message);
      await recordDurableProviderFailure(supabase, providerKey, failureCategory, errorCode, latencyMs);
      await recordAiProviderAttempt(supabase, {
        requestId: usageRequestId,
        providerKey,
        providerName: providerDef.name,
        attemptIndex,
        success: false,
        failureCategory,
        errorCode,
        latencyMs,
      });
      throw error;
    }
  };

  // ── EXPLICIT PROVIDER OVERRIDE ────────────────────────────────
  // Contract: if an authorized caller explicitly requests a provider,
  // respect that request. Do NOT silently reroute. If the provider fails,
  // return an error (no silent fallback) unless a safe-fallback option is
  // explicitly authorized by contract (none currently).
  if (explicitProvider) {
    const providerMap: Record<string, ProviderKey> = {
      kimi: "KIMI", moonshot: "KIMI",
      claude: "CLAUDE_SONNET", anthropic: "CLAUDE_SONNET",
      groq: "GROQ_LLAMA8B",
      deepseek: "DEEPSEEK_FLASH", deepseek_pro: "DEEPSEEK_PRO",
      mistral: "MISTRAL_SMALL",
      gemini: "GEMINI_FLASH",
      openai: "GPT_MINI", gpt: "GPT_MINI", gpt4o: "GPT4O",
      perplexity: "PERPLEXITY",
      grok: "GROK_FAST",
      zai: "ZAI", "z.ai": "ZAI", zhipu: "ZAI",
      replicate: "REPLICATE",
    };
    const providerKey = providerMap[explicitProvider.toLowerCase()];
    if (providerKey === "REPLICATE") {
      await finishAiUsageRequest(supabase, {
        requestId: usageRequestId,
        status: "blocked",
        errorCode: "PROVIDER_ACCOUNTING_UNAVAILABLE",
      });
      return json({
        error: "Replicate is temporarily unavailable until usage accounting is enabled.",
        code: "PROVIDER_ACCOUNTING_UNAVAILABLE",
        request_id: usageRequestId,
      }, 503);
    }
    if (providerKey && providerKey in PROVIDERS) {
      const unavailable = await loadDurablyUnavailableProviders(supabase, [providerKey]);
      if (unavailable.has(providerKey)) {
        await finishAiUsageRequest(supabase, {
          requestId: usageRequestId,
          status: "blocked",
          errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
        });
        return json({
          error: `Provider ${explicitProvider} is temporarily unavailable`,
          code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
          request_id: usageRequestId,
        }, 503);
      }

      const providerDef = PROVIDERS[providerKey] as typeof PROVIDERS[typeof providerKey] & { name: string };
      const start = Date.now();
      try {
        const result = await governedProviderCall(providerKey);
        const latencyMs = Date.now() - start;
        const costUsd = (result.tokensIn / 1_000_000 * providerDef.costIn) +
          (result.tokensOut / 1_000_000 * providerDef.costOut);
        const creditsUsed = Math.ceil(costUsd * 1000);
        if (user?.id) {
          const wsId = (authorizedWorkspaceId && authorizedWorkspaceId !== "internal")
            ? authorizedWorkspaceId : null;
          const { error: txErr } = await supabase.from("credit_transactions").insert({
            workspace_id: wsId, user_id: user.id,
            amount: -creditsUsed, balance_after: null,
            transaction_type: "ai_usage",
            description: `${providerDef.name} | ${explicitProvider} | ${result.tokensIn}in+${result.tokensOut}out tokens`,
            reference_id: `ai_${Date.now()}_${explicitProvider}`,
          });
          if (txErr) console.error("[ai-router] billing insert failed:", txErr.message);
        }
        if (limitCtx) await incrementAiReplies(supabase, limitCtx);
        await finishAiUsageRequest(supabase, {
          requestId: usageRequestId,
          status: "succeeded",
          successfulProviderKey: providerKey,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd,
          creditsUsed,
          latencyMs,
          fallbackUsed: false,
          totalProviderAttempts: providerAttemptIndex,
        });
        return json({
          response: result.text, content: result.text, text: result.text,
          provider: providerDef.name, provider_key: providerKey,
          task_type: explicitProvider, tier: "explicit",
          tokens: { in: result.tokensIn, out: result.tokensOut },
          cost_usd: Math.round(costUsd * 10000) / 10000,
          credits_used: creditsUsed, latency_ms: latencyMs,
          workspace_id: authorizedWorkspaceId,
          fallback_used: false,
          attempted_providers: [{ provider: providerDef.name, success: true }],
          total_attempts: 1,
          request_id: usageRequestId,
        });
      } catch (e: any) {
        await finishAiUsageRequest(supabase, {
          requestId: usageRequestId,
          status: "failed",
          latencyMs: Date.now() - start,
          totalProviderAttempts: providerAttemptIndex,
          errorCode: "EXPLICIT_PROVIDER_FAILED",
        });
        return json({
          error: `Provider ${explicitProvider} failed`,
          code: "EXPLICIT_PROVIDER_FAILED",
          request_id: usageRequestId,
        }, 503);
      }
    }
    await finishAiUsageRequest(supabase, {
      requestId: usageRequestId,
      status: "blocked",
      errorCode: "UNKNOWN_PROVIDER",
    });
    return json({
      error: `Unknown provider "${explicitProvider}". Valid explicit providers: kimi, moonshot, claude, anthropic, deepseek, mistral, gemini, openai, gpt, gpt4o, perplexity, grok, zai, replicate, groq.`,
      request_id: usageRequestId,
    }, 400);
  }

  // ── MULTI-PROVIDER FAILOVER ROUTING ───────────────────────────
  const taskType = resolvedTaskType;
  const routeConfig = ROUTE_CHAINS[taskType];
  if (!routeConfig) {
    await finishAiUsageRequest(supabase, {
      requestId: usageRequestId,
      status: "blocked",
      errorCode: "TASK_TYPE_ROUTE_UNDEFINED",
    });
    return json({
      error: `No routing profile for task_type "${taskType}"`,
      code: "TASK_TYPE_ROUTE_UNDEFINED",
      request_id: usageRequestId,
    }, 400);
  }

  // Cap chain to total provider budget, then skip providers that have an
  // authoritative future cooldown/quota window. If the health store is not
  // available yet, the helper returns an empty set and legacy routing remains.
  const configuredChain = routeConfig.chain.slice(0, TOTAL_PROVIDER_BUDGET);
  // Preserve capability order within each class, but exhaust every free allowance first.
  const candidateChain = [
    ...configuredChain.filter((key) => FREE_ALLOWANCE_PROVIDERS.has(key)),
    ...configuredChain.filter((key) => !FREE_ALLOWANCE_PROVIDERS.has(key)),
  ];
  const unavailableProviders = await loadDurablyUnavailableProviders(supabase, candidateChain);
  const chain = candidateChain.filter((key) => !unavailableProviders.has(key));
  if (!chain.length) {
    await finishAiUsageRequest(supabase, {
      requestId: usageRequestId,
      status: "blocked",
      errorCode: "ALL_PROVIDERS_UNAVAILABLE",
    });
    return json({
      error: "All AI providers are temporarily unavailable",
      code: "ALL_PROVIDERS_UNAVAILABLE",
      request_id: usageRequestId,
    }, 503);
  }

  const start = Date.now();

  // Same task context is forwarded unchanged to every provider candidate.
  // Workspace authorization state, messages, system prompt remain constant.
  try {
    const failoverResult = await executeWithFailover(
      chain,
      (key) => governedProviderCall(key as ProviderKey),
      (key) => (PROVIDERS[key as ProviderKey] as { name: string }).name,
      { attempted: new Set() },
    );

    const latencyMs = Date.now() - start;
    const usedKey = failoverResult.providerKey as ProviderKey;
    const usedProvider = PROVIDERS[usedKey];
    const costUsd = (failoverResult.value.tokensIn / 1_000_000 * usedProvider.costIn) +
      (failoverResult.value.tokensOut / 1_000_000 * usedProvider.costOut);
    const creditsUsed = Math.ceil(costUsd * 1000);

    // Billing: charge only for the ONE successful provider call.
    // Failed attempts are never billed to the customer.
    if (user?.id) {
      const wsId = (authorizedWorkspaceId && authorizedWorkspaceId !== "internal")
        ? authorizedWorkspaceId : null;
      const { error: txErr } = await supabase.from("credit_transactions").insert({
        workspace_id: wsId, user_id: user.id,
        amount: -creditsUsed, balance_after: null,
        transaction_type: "ai_usage",
        description: `${usedProvider.name} | ${taskType} | ${failoverResult.value.tokensIn}in+${failoverResult.value.tokensOut}out | ${latencyMs}ms`,
        reference_id: `ai_${Date.now()}_${taskType}`,
      });
      if (txErr) console.error("[ai-router] billing insert failed:", txErr.message);
    }

    // One logical request counts once — even if several providers were attempted.
    if (limitCtx) await incrementAiReplies(supabase, limitCtx);

    await finishAiUsageRequest(supabase, {
      requestId: usageRequestId,
      status: "succeeded",
      successfulProviderKey: usedKey,
      tokensIn: failoverResult.value.tokensIn,
      tokensOut: failoverResult.value.tokensOut,
      costUsd,
      creditsUsed,
      latencyMs,
      fallbackUsed: failoverResult.fallbackUsed,
      totalProviderAttempts: providerAttemptIndex,
    });

    // Safe observability metadata — no API keys, no raw provider bodies
    const attemptedMeta = failoverResult.attemptedProviders.map(a => ({
      provider: a.providerName,
      success: a.success,
      ...(a.failureCategory ? { failure_category: a.failureCategory } : {}),
    }));

    return json({
      response: failoverResult.value.text,
      content:  failoverResult.value.text,
      text:     failoverResult.value.text,
      provider: usedProvider.name,
      provider_key: usedKey,
      task_type: taskType,
      tier: routeConfig.tier,
      tokens: { in: failoverResult.value.tokensIn, out: failoverResult.value.tokensOut },
      cost_usd: Math.round(costUsd * 10000) / 10000,
      credits_used: creditsUsed,
      latency_ms: latencyMs,
      workspace_id: authorizedWorkspaceId,
      // Observability
      fallback_used: failoverResult.fallbackUsed,
      attempted_providers: attemptedMeta,
      total_attempts: failoverResult.totalAttempts,
      request_id: usageRequestId,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err instanceof FailoverExhaustedError) {
      const failCategories = err.attempts
        .filter(a => !a.success)
        .map(a => a.failureCategory ?? "UNKNOWN");
      const uniqueCategories = [...new Set(failCategories)];
      await finishAiUsageRequest(supabase, {
        requestId: usageRequestId,
        status: "failed",
        latencyMs,
        totalProviderAttempts: providerAttemptIndex,
        errorCode: "ALL_PROVIDERS_FAILED",
      });
      // Safe: only expose counts and categories — no raw provider bodies
      return json({
        error: "All AI providers failed",
        code: "ALL_PROVIDERS_FAILED",
        attempted_count: err.attempts.length,
        failure_categories: uniqueCategories,
        latency_ms: latencyMs,
        request_id: usageRequestId,
      }, 503);
    }
    await finishAiUsageRequest(supabase, {
      requestId: usageRequestId,
      status: "failed",
      latencyMs,
      totalProviderAttempts: providerAttemptIndex,
      errorCode: "ROUTER_ERROR",
    });
    // Unexpected error
    console.error("[ai-router] unexpected error:", err);
    return json({
      error: "Internal router error",
      code: "ROUTER_ERROR",
      request_id: usageRequestId,
    }, 500);
  }
});