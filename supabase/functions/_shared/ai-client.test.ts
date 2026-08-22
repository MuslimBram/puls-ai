import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { askAI } from "./ai-client.ts";

Deno.test("ai-client routes workspace calls through canonical ai-router", async () => {
  const originalFetch = globalThis.fetch;
  try {
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service_key");
    Deno.env.set("INTERNAL_WEBHOOK_SECRET", "internal_secret");

    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ response: "ok" }), { status: 200 });
    }) as typeof fetch;

    const result = await askAI("sys", "hello", 123, {
      workspaceId: "ws_1",
      taskType: "balanced",
    });

    assertEquals(result, "ok");
    assertEquals(capturedUrl, "https://example.supabase.co/functions/v1/ai-router");

    const headers = capturedInit?.headers as Record<string, string>;
    assertEquals(headers.Authorization, "******");
    assertEquals(headers["x-internal-secret"], "internal_secret");

    const payload = JSON.parse(String(capturedInit?.body));
    assertEquals(payload.task_type, "balanced");
    assertEquals(payload.workspace_id, "ws_1");
    assertEquals(payload.max_tokens, 123);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ai-client fails closed when workspace/auth context is missing", async () => {
  await assertRejects(
    () => askAI("sys", "hello", 100, { taskType: "balanced" }),
    Error,
    "workspace context or verified auth",
  );
});

Deno.test("ai-client uses verified auth context when provided", async () => {
  const originalFetch = globalThis.fetch;
  try {
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");

    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ response: "ok" }), { status: 200 });
    }) as typeof fetch;

    await askAI("sys", "hello", 100, {
      workspaceId: "ws_2",
      authHeader: "******",
      taskType: "text_classification",
      userId: "user_1",
    });

    const headers = capturedInit?.headers as Record<string, string>;
    assertEquals(headers.Authorization, "******");
    assertEquals(Boolean(headers["x-internal-secret"]), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ai-client supports internal customer_support calls without workspace", async () => {
  const originalFetch = globalThis.fetch;
  try {
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service_key");
    Deno.env.set("INTERNAL_WEBHOOK_SECRET", "internal_secret");

    let capturedBody = "";
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ response: "ok" }), { status: 200 });
    }) as typeof fetch;

    const result = await askAI("sys", "hello", 100, { taskType: "customer_support" });
    assertEquals(result, "ok");

    const payload = JSON.parse(capturedBody);
    assertEquals(payload.workspace_id, undefined);
    assertEquals(payload.task_type, "customer_support");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
