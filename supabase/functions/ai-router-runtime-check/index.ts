import { getServiceKey } from "../_shared/admin-client.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authFailure = requireCronAuth(req);
  if (authFailure) {
    return new Response(authFailure.body, {
      status: authFailure.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  const serviceKey = getServiceKey();
  if (!supabaseUrl || !internalSecret || !serviceKey) {
    return json({ ok: false, code: "RUNTIME_CHECK_NOT_CONFIGURED" }, 503);
  }

  // Deliberately fixed contract: the caller cannot choose a provider, prompt,
  // workspace, token budget, or fallback chain. This endpoint exists only for
  // the controlled production acceptance gate.
  const routerResponse = await fetch(`${supabaseUrl}/functions/v1/ai-router`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      provider: "groq",
      task_type: "customer_support",
      internal_system_task: true,
      messages: [{ role: "user", content: "Reply only OK" }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  let result: Record<string, unknown> = {};
  try {
    result = await routerResponse.json() as Record<string, unknown>;
  } catch {
    return json({ ok: false, code: "ROUTER_INVALID_RESPONSE", router_status: routerResponse.status }, 502);
  }

  if (!routerResponse.ok) {
    return json({
      ok: false,
      code: String(result.code ?? "ROUTER_RUNTIME_CHECK_FAILED"),
      router_status: routerResponse.status,
    }, routerResponse.status);
  }

  const responseText = String(result.response ?? result.content ?? result.text ?? "").trim();
  const tokens = (result.tokens ?? {}) as Record<string, unknown>;

  return json({
    ok: responseText.toUpperCase() === "OK",
    router_status: routerResponse.status,
    provider_key: result.provider_key,
    response_exact_ok: responseText.toUpperCase() === "OK",
    tokens: {
      in: typeof tokens.in === "number" ? tokens.in : null,
      out: typeof tokens.out === "number" ? tokens.out : null,
    },
    cost_usd: typeof result.cost_usd === "number" ? result.cost_usd : null,
    credits_used: typeof result.credits_used === "number" ? result.credits_used : null,
    latency_ms: typeof result.latency_ms === "number" ? result.latency_ms : null,
    total_attempts: result.total_attempts,
    fallback_used: result.fallback_used,
    request_id: result.request_id,
  });
});
