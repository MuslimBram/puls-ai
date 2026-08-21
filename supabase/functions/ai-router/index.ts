// supabase/functions/ai-router/index.ts
// ============================================================
// PULSE AI — Intelligent Multi-Provider AI Router
// 14 providers · Task classification · Auto-fallback · Cost optimization
// 70% cheaper than single-provider approach
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";

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
    model: "claude-sonnet-4-6", keyEnv: "ANTHROPIC_API_KEY", type: "anthropic",
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
  // Configurable OpenAI-compatible provider.
  // ZAI_BASE_URL overrides the base endpoint at runtime (no redeploy required).
  // Default points to z.ai's OpenAI-compat endpoint.
  ZAI: {
    name: "Z.ai",
    costIn: 0.20, costOut: 0.60,   // placeholder — override per plan
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    model: "glm-4.7-flash",           // default; override with ZAI_MODEL env var
    keyEnv: "ZAI_API_KEY",
    modelEnvOverride: "ZAI_MODEL",
    endpointEnvOverride: "ZAI_BASE_URL",  // full URL override
    type: "openai_compat",
    timeoutMs: 30_000,
  },
  // ── Replicate ─────────────────────────────────────────────────────────────
  // Async prediction model — handled separately in callProviderReplicate().
  // Uses polling (no streaming in current implementation).
  REPLICATE: {
    name: "Replicate",
    costIn: 0.05, costOut: 0.25,   // token pricing varies by model
    endpoint: "https://api.replicate.com/v1/models",
    model: "meta/meta-llama-3-8b-instruct",  // default; override with REPLICATE_MODEL
    keyEnv: "REPLICATE_API_TOKEN",
    modelEnvOverride: "REPLICATE_MODEL",
    type: "replicate",              // special handler
    timeoutMs: 60_000,              // predictions can take longer
  },
  };

// ── ROUTING DECISION MATRIX ───────────────────────────────────
type TaskType =
  | "simple_chat" | "high_volume" | "balanced" | "complex_reasoning"
  | "coding" | "web_research" | "rag" | "multimodal" | "multilingual"
  | "sales_reply" | "marketing_copy" | "customer_support";

const CANONICAL_TASK_TYPES: readonly TaskType[] = [
  "simple_chat",
  "high_volume",
  "balanced",
  "complex_reasoning",
  "coding",
  "web_research",
  "rag",
  "multimodal",
  "multilingual",
  "sales_reply",
  "marketing_copy",
  "customer_support",
];

const TASK_TYPE_ALIASES: Readonly<Record<string, TaskType>> = {
  brain: "complex_reasoning",
  voice_ai: "high_volume",
  text_classification: "balanced",
  multimodal_vision: "multimodal",
};

// ── TASK TYPE NORMALIZER ──────────────────────────────────────
// Defined at module scope so both the request handler and classifyTask
// can call it without scoping issues.
function normalizeTaskType(taskType?: string): TaskType | null {
  if (!taskType) return null;
  const normalized = taskType.trim().toLowerCase();
  if ((CANONICAL_TASK_TYPES as readonly string[]).includes(normalized)) {
    return normalized as TaskType;
  }
  return TASK_TYPE_ALIASES[normalized] ?? null;
}

const ROUTING_TABLE: Record<TaskType, { primary: keyof typeof PROVIDERS; fallback: keyof typeof PROVIDERS; tier: "cheap"|"mid"|"premium" }> = {
  simple_chat:       { primary: "GROQ_LLAMA8B",    fallback: "DEEPSEEK_FLASH", tier: "cheap" },
  high_volume:       { primary: "DEEPSEEK_FLASH",  fallback: "GROQ_LLAMA8B",  tier: "cheap" },
  balanced:          { primary: "MISTRAL_SMALL",   fallback: "GPT_MINI",      tier: "cheap" },
  complex_reasoning: { primary: "CLAUDE_SONNET",   fallback: "GPT4O",         tier: "premium" },
  coding:            { primary: "CLAUDE_SONNET",   fallback: "GPT4O",         tier: "premium" },
  web_research:      { primary: "PERPLEXITY",      fallback: "GEMINI_FLASH",  tier: "premium" },
  rag:               { primary: "DEEPSEEK_PRO",    fallback: "MISTRAL_SMALL", tier: "mid" },
  multimodal:        { primary: "GEMINI_FLASH",    fallback: "GPT4O",         tier: "mid" },
  multilingual:      { primary: "DEEPSEEK_FLASH",  fallback: "MISTRAL_SMALL", tier: "cheap" },
  sales_reply:       { primary: "MISTRAL_SMALL",   fallback: "GROQ_LLAMA70B", tier: "cheap" },
  marketing_copy:    { primary: "CLAUDE_SONNET",   fallback: "GPT4O",         tier: "premium" },
  customer_support:  { primary: "CLAUDE_SONNET", fallback: "DEEPSEEK_FLASH",tier: "cheap" },
};

// ── TASK CLASSIFIER ───────────────────────────────────────────
function classifyTask(
  prompt: string,
  options: { planTier?: string; preferCheap?: boolean }
): TaskType {
  const p = prompt.toLowerCase();

  // Coding detection
  if (/function|class|import|def |const |var |let |sql|query|code|script|api|endpoint|bug|error|typescript|python|javascript/.test(p)) {
    return "coding";
  }
  // Web research
  if (/search|find|latest|current|today|news|2026|price of|who is|what is/.test(p)) {
    return "web_research";
  }
  // Complex reasoning
  if (/analyze|strategy|compare|explain|reasoning|step by step|why|because|proof|thesis/.test(p) && p.length > 200) {
    return "complex_reasoning";
  }
  // Marketing copy
  if (/write|create|generate|post|caption|email|newsletter|ad|campaign|marketing/.test(p) && p.length > 50) {
    return "marketing_copy";
  }
  // Customer support context
  if (/customer|client|complaint|help|support|problem|issue|how do i/.test(p)) {
    return "customer_support";
  }
  // Sales reply
  if (/price|cost|offer|discount|buy|purchase|interested|quote/.test(p)) {
    return "sales_reply";
  }
  // High volume (short messages)
  if (p.length < 100 && options.preferCheap) {
    return "high_volume";
  }
  // Plan-based routing
  if (options.planTier === "starter" || options.planTier === "free") {
    return "balanced";
  }

  return "balanced";
}

// ── CALL PROVIDER ─────────────────────────────────────────────
async function callProvider(
  providerKey: keyof typeof PROVIDERS,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  apiKeys: Record<string, string>
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const p = PROVIDERS[providerKey] as typeof PROVIDERS[typeof providerKey] & {
    keyEnvFallback?: string;
    modelEnvOverride?: string;
    timeoutMs?: number;
  };

  // Key resolution: primary env → fallback env
  const apiKey = apiKeys[p.keyEnv]
    ?? Deno.env.get(p.keyEnv)
    ?? (p.keyEnvFallback ? Deno.env.get(p.keyEnvFallback) : undefined);
  if (!apiKey) throw new Error(`API key mungon: ${p.keyEnv}${p.keyEnvFallback ? ` (alias: ${p.keyEnvFallback})` : ""}`);

  // Model override via env var (KIMI_MODEL, ZAI_MODEL, REPLICATE_MODEL, etc.)
  const model = p.modelEnvOverride ? (Deno.env.get(p.modelEnvOverride) ?? p.model) : p.model;

  // Endpoint override via env var (ZAI_BASE_URL etc.)
  const endpoint = (p.endpointEnvOverride ? Deno.env.get(p.endpointEnvOverride) : null) ?? p.endpoint;

  // Provider timeout (default 25s)
  const timeoutMs = p.timeoutMs ?? 25_000;
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  // Replicate uses async prediction model — separate handler
  if (p.type === "replicate") {
    clearTimeout(timer);
    return await callProviderReplicate(apiKey, model, messages, systemPrompt, maxTokens, p.timeoutMs ?? 60_000);
  }

  if (p.type === "anthropic") {
    let lastAnthErr: Error = new Error("unreachable");
    for (let attempt = 0; attempt <= 2; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(p.endpoint, {
          method: "POST",
          headers: {"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
          body: JSON.stringify({model, max_tokens:maxTokens, system:systemPrompt,
            messages: messages.filter(m => m.role !== "system")}),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          if (res.status===400||res.status===401||res.status===402||res.status===403)
            throw new Error(`${p.name}: permanent_failure (${res.status}) ${errBody.slice(0,80)}`);
          if (res.status === 429) {
            lastAnthErr = new Error(`${p.name}: rate_limited (429)`);
            if (attempt < 2) {
              const ra = parseInt(res.headers.get("Retry-After") ?? "2", 10);
              await new Promise(r => setTimeout(r, Math.min(ra*1000, 8000)));
              continue;
            }
            throw lastAnthErr;
          }
          if (res.status >= 500) {
            lastAnthErr = new Error(`${p.name}: provider_error (${res.status}) ${errBody.slice(0,80)}`);
            if (attempt < 2) { await new Promise(r => setTimeout(r, 1200*(attempt+1))); continue; }
            throw lastAnthErr;
          }
          throw new Error(`${p.name}: http_error (${res.status}) ${errBody.slice(0,80)}`);
        }
        clearTimeout(timer);
        const d = await res.json() as any;
        return {text: d.content?.[0]?.text ?? "", tokensIn: d.usage?.input_tokens ?? 0,
          tokensOut: d.usage?.output_tokens ?? 0, modelUsed: model};
      } catch (e: any) {
        clearTimeout(t);
        if (e.name === "AbortError") {
          lastAnthErr = new Error(`${p.name}: timeout after ${timeoutMs}ms`);
          if (attempt < 2) continue;
          throw lastAnthErr;
        }
        if (e.message?.includes("permanent_failure")) throw e;
        lastAnthErr = e;
        if (attempt >= 2) throw lastAnthErr;
      }
    }
    clearTimeout(timer);
    throw lastAnthErr!;
  }

  // OpenAI-compatible (includes Kimi/Moonshot, Groq, DeepSeek, OpenAI, Gemini, Mistral, Grok)
  const allMessages = [
    { role: "system", content: systemPrompt },
    ...messages.filter(m => m.role !== "system"),
  ];
  // Bounded retry: max 2 retries for transient 429/5xx only.
  // Permanent failures (400/401/402/403) are NOT retried.
  let lastErr: Error = new Error("unreachable");
  for (let attempt = 0; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: allMessages, max_tokens: maxTokens, temperature: 0.7 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        // Permanent — never retry
        if (res.status === 400 || res.status === 401 || res.status === 402 || res.status === 403)
          throw new Error(`${p.name}: permanent_failure (${res.status}) ${errText.slice(0, 80)}`);
        // Rate limit — honor Retry-After
        if (res.status === 429) {
          lastErr = new Error(`${p.name}: rate_limited (429)`);
          if (attempt < 2) {
            const ra = parseInt(res.headers.get("Retry-After") ?? "2", 10);
            await new Promise(r => setTimeout(r, Math.min(ra * 1000, 8000)));
            continue;
          }
          throw lastErr;
        }
        // 5xx transient
        if (res.status >= 500) {
          lastErr = new Error(`${p.name}: provider_error (${res.status}) ${errText.slice(0, 80)}`);
          if (attempt < 2) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
          throw lastErr;
        }
        throw new Error(`${p.name}: http_error (${res.status}) ${errText.slice(0, 80)}`);
      }
      const d = await res.json() as any;
      return {
        text: d.choices?.[0]?.message?.content ?? "",
        tokensIn: d.usage?.prompt_tokens ?? 0,
        tokensOut: d.usage?.completion_tokens ?? 0,
        modelUsed: d.model,
      };
    } catch (e: any) {
      clearTimeout(t);
      if (e.name === "AbortError") {
        lastErr = new Error(`${p.name}: timeout after ${timeoutMs}ms`);
        if (attempt < 2) continue;
        throw lastErr;
      }
      if (e.message?.includes("permanent_failure")) throw e;
      lastErr = e;
      if (attempt >= 2) throw lastErr;
    }
  }
  clearTimeout(timer);
  throw lastErr;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
// ── REPLICATE ASYNC PREDICTION HANDLER ───────────────────────────────────────
// Replicate uses an async prediction model: create → poll → result.
// Normalized to same return contract as callProvider.

async function incrementAiReplies(
  supabase: ReturnType<typeof createClient>,
  ctx: {userId:string;newDay:boolean;effectiveUsed:number}
): Promise<void> {
  const newVal = ctx.newDay ? 1 : ctx.effectiveUsed + 1;
  const upd: Record<string,unknown> = {ai_replies_today: newVal};
  if (ctx.newDay) upd.ai_replies_reset_at = new Date().toISOString();
  const {error} = await supabase.from("subscriptions").update(upd).eq("user_id", ctx.userId);
  if (error) console.error("[ai-router] increment ai_replies failed:", error.message);
}
async function callProviderReplicate(
  apiKey: string,
  model: string,  // format: "owner/model" e.g. "meta/meta-llama-3-8b-instruct"
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelUsed?: string }> {
  const headers = {
    "Authorization": `Token ${apiKey}`,
    "Content-Type": "application/json",
    "Prefer": "wait",    // ask Replicate to wait synchronously (up to 60s)
  };

  // Build the prompt for text generation models
  function buildLlama3Prompt(msgs: Array<{role:string;content:string}>, sys: string): string {
    let p = sys ? "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n" + sys + "<|eot_id|>" : "<|begin_of_text|>";
    for (const m of msgs.filter(x => x.role !== "system")) {
      const role = m.role === "assistant" ? "assistant" : "user";
      p += "<|start_header_id|>" + role + "<|end_header_id|>\n\n" + m.content + "<|eot_id|>";
    }
    p += "<|start_header_id|>assistant<|end_header_id|>\n\n";
    return p;
  }
  const prompt = buildLlama3Prompt(messages, systemPrompt);

  // Bounded retry for Replicate create: max 2 retries for 429/5xx.
  // Never retry 400/401/402/403/422 (permanent failures).
  const repBody = JSON.stringify({
    input: { prompt, system_prompt: systemPrompt || undefined,
      max_tokens: maxTokens, temperature: 0.01 },
  });
  let createRes!: Response;
  let repLastErr: Error = new Error("unreachable");
  for (let repAttempt = 0; repAttempt <= 2; repAttempt++) {
    createRes = await fetch(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      { method: "POST", headers, body: repBody, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (createRes.ok) break;
    const errText = await createRes.text().catch(() => "");
    // Permanent — never retry
    if (createRes.status === 400 || createRes.status === 401 ||
        createRes.status === 402 || createRes.status === 403 || createRes.status === 422)
      throw new Error(`Replicate: permanent_failure (${createRes.status}) ${errText.slice(0, 120)}`);
    // 429 rate limit — honor Retry-After
    if (createRes.status === 429) {
      repLastErr = new Error(`Replicate: rate_limited (429)`);
      if (repAttempt < 2) {
        const ra = parseInt(createRes.headers.get("Retry-After") ?? "2", 10);
        await new Promise(r => setTimeout(r, Math.min(ra * 1000, 8000)));
        continue;
      }
      throw repLastErr;
    }
    // 5xx transient — backoff retry
    if (createRes.status >= 500) {
      repLastErr = new Error(`Replicate: provider_error (${createRes.status}) ${errText.slice(0, 80)}`);
      if (repAttempt < 2) {
        await new Promise(r => setTimeout(r, 1500 * (repAttempt + 1)));
        continue;
      }
      throw repLastErr;
    }
    throw new Error(`Replicate: create_failed (${createRes.status}) ${errText.slice(0, 100)}`);
  }
  if (!createRes.ok) throw repLastErr;

  const prediction = await createRes.json() as any;

  // Replicate with "Prefer: wait" may return completed prediction immediately
  if (prediction.status === "succeeded") {
    const output = Array.isArray(prediction.output)
      ? prediction.output.join("") : (prediction.output ?? "");
    return { text: output.trim(), tokensIn: 0, tokensOut: 0, modelUsed: model };
  }
  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new Error(`Replicate: prediction ${prediction.status} — ${prediction.error ?? "unknown"}`);
  }

  // Poll until complete (fallback if Prefer:wait not honoured)
  const predId = prediction.id;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1_500));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predId}`,
      { headers: { "Authorization": `Token ${apiKey}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!pollRes.ok) break;
    const poll = await pollRes.json() as any;
    if (poll.status === "succeeded") {
      const output = Array.isArray(poll.output) ? poll.output.join("") : (poll.output ?? "");
      return { text: output.trim(), tokensIn: 0, tokensOut: 0, modelUsed: model };
    }
    if (poll.status === "failed" || poll.status === "canceled") {
      throw new Error(`Replicate: prediction ${poll.status} — ${poll.error ?? "unknown"}`);
    }
  }
  throw new Error(`Replicate: timeout after ${timeoutMs}ms (prediction ${predId})`);
}


serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
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
    ? { data: { user: null } }  // internal path — no user JWT needed
    : await supabase.auth.getUser(bearerToken);

  if (!isInternal && !user) return json({ error: "Unauthorized" }, 401);

  let body: {
    messages: Array<{ role: string; content: string }>;
    system_prompt?: string;
    task_type?: string;
    max_tokens?: number;
    workspace_id?: string;
    prefer_cheap?: boolean;
    plan_tier?: string;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  // plan_tier from body is IGNORED — never trust client-supplied entitlements.
  // workspace_id may be provided but verified before credit deduction.
  // Accept both system_prompt (api) and system (customer-brain) for compatibility.
  // provider: explicit provider key (e.g. "kimi") bypasses task classifier routing.
  const { messages, system_prompt: bodySystemPrompt, system: bodySystem,
          task_type, max_tokens = 800, workspace_id, prefer_cheap = false,
          provider: explicitProvider } = body as typeof body & { provider?: string };

  // Normalize system prompt — accept either field name
  const system_prompt = bodySystemPrompt ?? bodySystem ?? "";

  if (!messages?.length) return json({ error: "messages janë të detyrueshme" }, 400);

  // Server-side plan tier — do not trust plan_tier from body
  // TODO: derive from workspace subscription table when available
  const plan_tier = "growth";  // server-determined default

  // Workspace isolation: if workspace_id provided, verify user is a member
  // before logging/debiting that workspace
  const authorizedWorkspaceId = await (async () => {
    if (isInternal) return workspace_id ?? null;  // null for system calls — never "internal" as UUID  // internal calls trust provided workspace_id
    if (!user) return null;
    if (!workspace_id) {
      // 1. First workspace owned by this user
      const { data: ownedWs } = await supabase.from("workspaces")
        .select("id").eq("owner_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (ownedWs?.id) return ownedWs.id;
      // 2. Fallback: first workspace where user is a member (but not owner)
      const { data: memWs } = await supabase.from("workspace_members")
        .select("workspace_id").eq("user_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (memWs?.workspace_id) return memWs.workspace_id;
      return null;  // user has no workspace
    }
    const { data: member } = await supabase.rpc("is_workspace_member",
      { _user_id: user.id, _workspace_id: workspace_id });
    const { data: owned } = await supabase.from("workspaces")
      .select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle();
    if (!member && !owned) return null;
    return workspace_id;
  })();

  if (!authorizedWorkspaceId) return json({ error: "Forbidden: not a member of workspace" }, 403);

  // limitCtx: stores limit state for post-call increment (only on success, not on failure).
  let limitCtx: {userId:string;newDay:boolean;effectiveUsed:number;dailyLimit:number}|null = null;

  if (!isInternal && user) {
    const today = new Date().toDateString();
    const { data: sub } = await supabase.from("subscriptions")
      .select("plan,ai_replies_today,ai_replies_reset_at")
      .eq("user_id", user.id).maybeSingle();
    if (sub) {
      // Map legacy and unknown plans to "standard". Unknown plans are NEVER unlimited.
      const PLAN_MAP: Record<string,string> = {free:"standard",basic:"standard"};
      const resolvedPlan = PLAN_MAP[sub.plan ?? ""] ?? (sub.plan || "standard");
      const { data: pr } = await supabase.from("pricing_settings")
        .select("ai_replies_per_day_limit").eq("plan_key", resolvedPlan).maybeSingle();
      let pricingRow = pr;
      if (!pricingRow) {
        const { data: std } = await supabase.from("pricing_settings")
          .select("ai_replies_per_day_limit").eq("plan_key","standard").maybeSingle();
        pricingRow = std;
      }
      // Conservative default (50/day) if no pricing row found at all.
      const dailyLimit = pricingRow?.ai_replies_per_day_limit ?? 50;
      const resetAt = sub.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at).toDateString() : null;
      const newDay = resetAt !== today;
      const effectiveUsed = newDay ? 0 : (sub.ai_replies_today ?? 0);
      if (effectiveUsed >= dailyLimit) {
        return json({error:"Daily AI reply limit reached. Upgrade for more AI replies.",
          limit:dailyLimit, current:effectiveUsed, allowed:false}, 429);
      }
      limitCtx = {userId:user.id, newDay, effectiveUsed, dailyLimit};
    }
  }

  // Explicit provider override: body.provider="kimi" routes directly to KIMI
  // bypassing the task classifier. Other providers can be added the same way.
  if (explicitProvider) {
    const providerMap: Record<string, keyof typeof PROVIDERS> = {
      kimi:         "KIMI",
      moonshot:     "KIMI",
      claude:       "CLAUDE_SONNET",
      anthropic:    "CLAUDE_SONNET",
      groq:         "GROQ_LLAMA8B",
      deepseek:     "DEEPSEEK_FLASH",
      deepseek_pro: "DEEPSEEK_PRO",
      mistral:      "MISTRAL_SMALL",
      gemini:       "GEMINI_FLASH",
      openai:       "GPT_MINI",
      gpt:          "GPT_MINI",
      gpt4o:        "GPT4O",
      perplexity:   "PERPLEXITY",
      grok:         "GROK_FAST",
      zai:          "ZAI",
      "z.ai":       "ZAI",
      zhipu:        "ZAI",
      replicate:    "REPLICATE",
    };
    const providerKey = providerMap[explicitProvider.toLowerCase()];
    if (providerKey && providerKey in PROVIDERS) {
      const providerDef = PROVIDERS[providerKey] as typeof PROVIDERS[typeof providerKey] & { name: string };
      const start = Date.now();
      try {
        const result = await callProvider(providerKey, messages, system_prompt, max_tokens, {});
        const latencyMs = Date.now() - start;
        const costUsd = (result.tokensIn / 1_000_000 * providerDef.costIn) +
                        (result.tokensOut / 1_000_000 * providerDef.costOut);
        const creditsUsed = Math.ceil(costUsd * 1000);
        // Persist to credit_transactions (real table). Skip for system/internal calls.
        if (user?.id) {
          const wsId = (authorizedWorkspaceId && authorizedWorkspaceId !== "internal")
            ? authorizedWorkspaceId : null;
          const { error: txErr } = await supabase.from("credit_transactions").insert({
            workspace_id: wsId,
            user_id: user.id,
            amount: -creditsUsed,
            balance_after: null,
            transaction_type: "ai_usage",
            description: `${providerDef.name} | ${explicitProvider} | ${result.tokensIn}in+${result.tokensOut}out tokens`,
            reference_id: `ai_${Date.now()}_${explicitProvider}`,
          });
          if (txErr) console.error("[ai-router] billing insert failed:", txErr.message);
        }
        if (limitCtx) await incrementAiReplies(supabase, limitCtx);
        return json({
          response:     result.text,
          content:      result.text,
          text:         result.text,
          provider:     providerDef.name,
          provider_key: providerKey,
          task_type:    explicitProvider,
          tier:         "explicit",
          tokens:       { in: result.tokensIn, out: result.tokensOut },
          cost_usd:     Math.round(costUsd * 10000) / 10000,
          credits_used: creditsUsed,
          latency_ms:   latencyMs,
          workspace_id: authorizedWorkspaceId,
          fallback_used: false,
        });
      } catch (e: any) {
        return json({ error: `Provider ${explicitProvider} failed: ${e.message}` }, 503);
      }
    }
    // Unknown explicit provider key — fail closed with 400 (do NOT silently reroute)
    return json({ error: `Unknown provider "${explicitProvider}". Valid explicit providers: kimi, moonshot, claude, anthropic, deepseek, mistral, gemini, openai, gpt, gpt4o, perplexity, grok, zai, replicate, groq.` }, 400);
  }

  // Classify task
  const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
  const normalizedTaskType = normalizeTaskType(task_type);
  if (task_type && !normalizedTaskType) {
    const canonical = CANONICAL_TASK_TYPES.join(", ");
    const aliases = Object.keys(TASK_TYPE_ALIASES).join(", ");
    return json({
      error: `Unknown task_type "${task_type}"`,
      code: "UNSUPPORTED_TASK_TYPE",
      supported_task_types: canonical,
      aliases,
    }, 400);
  }

  const taskType = normalizedTaskType ?? classifyTask(lastUserMsg, { planTier: plan_tier, preferCheap: prefer_cheap });
  const route = ROUTING_TABLE[taskType];
  if (!route?.primary || !route?.fallback) {
    return json({
      error: `No routing profile configured for task_type "${taskType}"`,
      code: "TASK_TYPE_ROUTE_UNDEFINED",
    }, 400);
  }

  // API keys (from workspace config or env)
  const apiKeys: Record<string, string> = {};

  const start = Date.now();
  let providerUsed: keyof typeof PROVIDERS = route.primary;
  let result: { text: string; tokensIn: number; tokensOut: number };

  // Try primary, fallback if fails
  try {
    result = await callProvider(route.primary, messages, system_prompt, max_tokens, apiKeys);
    providerUsed = route.primary;
  } catch (primaryErr) {
    console.warn(`Primary ${route.primary} dështoi: ${primaryErr}. Duke provuar fallback...`);
    try {
      result = await callProvider(route.fallback, messages, system_prompt, max_tokens, apiKeys);
      providerUsed = route.fallback;
    } catch (fallbackErr) {
      // No Lovable Gateway — fail with 503
      return json({ error: `All AI providers failed. Primary: ${primaryErr}. Fallback: ${fallbackErr}` }, 503);
    }
  }

  const latencyMs = Date.now() - start;
  const provider = PROVIDERS[providerUsed];
  const costUsd = (result.tokensIn / 1_000_000 * provider.costIn) + (result.tokensOut / 1_000_000 * provider.costOut);
  const creditsUsed = Math.ceil(costUsd * 1000); // 1 credit = $0.001

  // Persist usage to credit_transactions (real table). Skip for internal calls.
  if (user?.id) {
    const wsId = (authorizedWorkspaceId && authorizedWorkspaceId !== "internal")
      ? authorizedWorkspaceId : null;
    const { error: txErr } = await supabase.from("credit_transactions").insert({
      workspace_id: wsId,
      user_id: user.id,
      amount: -creditsUsed,
      balance_after: null,
      transaction_type: "ai_usage",
      description: `${provider.name} | ${taskType} | ${result.tokensIn}in+${result.tokensOut}out | ${latencyMs}ms`,
      reference_id: `ai_${Date.now()}_${taskType}`,
    });
    if (txErr) console.error("[ai-router] billing insert failed:", txErr.message);
  }

  if (limitCtx) await incrementAiReplies(supabase, limitCtx);
  return json({
    response: result.text,    // customer-brain and other callers use 'response'
    content:  result.text,    // compatibility alias
    text:     result.text,    // legacy alias
    provider: provider.name,
    task_type: taskType,
    tier: route.tier,
    tokens: { in: result.tokensIn, out: result.tokensOut },
    cost_usd: Math.round(costUsd * 10000) / 10000,
    credits_used: creditsUsed,
    latency_ms: latencyMs,
    workspace_id: authorizedWorkspaceId,
  });
});
