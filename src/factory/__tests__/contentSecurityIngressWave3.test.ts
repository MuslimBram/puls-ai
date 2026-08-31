import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationByName } from "./readMigrationByName";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const publicApi = read("supabase/functions/public-api/index.ts");
const voice = read("supabase/functions/voice-ai-relay/index.ts");
const meta = read("supabase/functions/meta-webhook/index.ts");
const migration = readMigrationByName("public_api_ingress_idempotency.sql");

describe("P0.6 content-security ingress wave 3", () => {
  it("gates Public API messages after API-key tenant binding and before Inbox/Zapier side effects", () => {
    const auth = publicApi.indexOf("apiKeyData = await authenticateApiKey(req)");
    const tenant = publicApi.indexOf("const { id: apiKeyId, user_id, workspace_id, permissions } = apiKeyData");
    const messageBlock = publicApi.slice(publicApi.indexOf('case "messages"'));
    const scan = messageBlock.indexOf("const security = await scanInboundContent({");
    const inbox = messageBlock.indexOf('.from("inbox_messages").insert');
    const zapier = messageBlock.indexOf('fireZapierWebhooks(user_id, workspace_id, "message.received"');

    expect(auth).toBeGreaterThan(-1);
    expect(tenant).toBeGreaterThan(auth);
    for (const position of [scan, inbox, zapier]) expect(position).toBeGreaterThan(-1);
    expect(scan).toBeLessThan(inbox);
    expect(scan).toBeLessThan(zapier);
    expect(messageBlock).toContain('source: "public_api"');
    expect(messageBlock).toContain("if (blocksNormalIngress(security.decision))");
  });

  it("supports stable Public API retry identity without breaking legacy callers", () => {
    expect(publicApi).toContain("function publicApiEventId");
    expect(publicApi).toContain("return crypto.randomUUID()");
    expect(publicApi).toContain('body.event_id ?? req.headers.get("x-idempotency-key")');
    expect(publicApi).toContain('event_id: `api:${eventId}`');
    expect(publicApi).toContain("provider_message_id: eventId");
    expect(publicApi).toContain('error?.code === "23505"');
    expect(publicApi).toContain("reused: true");
  });

  it("makes Public API duplicate prevention fail-fast and non-destructive", () => {
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("RAISE EXCEPTION");
    expect(migration).toContain("inbox_messages_public_api_provider_event_unique");
    expect(migration).toContain("workspace_id, provider_message_id");
    expect(migration).not.toMatch(/delete\s+from\s+public\.inbox_messages/i);
  });

  it("authenticates and tenant-binds Voice before upgrade, then gates final prompts before handoff/AI/persistence", () => {
    const requestHandlerStart = voice.indexOf("Deno.serve(async (req) => {");
    expect(requestHandlerStart).toBeGreaterThan(-1);
    const requestHandler = voice.slice(requestHandlerStart);
    const resolver = requestHandler.indexOf("const wsCreds = calledParam");
    const signature = requestHandler.indexOf("const sigCheck = await verifyTwilioSignature(");
    const upgrade = requestHandler.indexOf("Deno.upgradeWebSocket(req)");
    expect(resolver).toBeGreaterThan(-1);
    expect(signature).toBeGreaterThan(resolver);
    expect(upgrade).toBeGreaterThan(signature);

    const promptBlock = requestHandler.slice(requestHandler.indexOf("socket.onmessage"));
    expect(promptBlock).toContain('if (msg.type === "setup")');
    expect(promptBlock).toContain("setupCallSid !== callSid");
    expect(promptBlock).toContain("ws_session_id: relaySessionId");
    expect(promptBlock).toContain("if (msg.last !== true) return");
    expect(promptBlock).toContain("if (!relaySessionId)");

    const promptFlow = promptBlock.slice(promptBlock.indexOf("const userText = msg.voicePrompt.trim()"));
    const scan = promptFlow.indexOf("const security = await scanInboundContent({");
    const handoff = promptFlow.indexOf("const handoffPhrases = [");
    const ai = promptFlow.indexOf("const aiResponse = await routeAI(");
    const persist = promptFlow.indexOf('sb.from("voice_ai_sessions").update');

    for (const position of [scan, handoff, ai, persist]) expect(position).toBeGreaterThan(-1);
    expect(scan).toBeLessThan(handoff);
    expect(scan).toBeLessThan(ai);
    expect(scan).toBeLessThan(persist);
    expect(promptFlow).toContain('source: "voice"');
    expect(promptFlow).toContain("if (blocksNormalIngress(security.decision))");
  });

  it("uses Twilio session-scoped Voice turn IDs and scrubs historical turns before AI", () => {
    expect(voice).toContain('const setupSessionId = typeof msg.sessionId === "string"');
    expect(voice).toContain('event_id: `voice:${relaySessionId}:turn:${promptSequence}`');
    expect(voice).toContain('content: scrubSensitive(String(t.content ?? ""))');
    expect(voice).toContain("{ role: \"user\", content: scrubSensitive(userMessage) }");
  });

  it("keeps Meta source wired to content security before normal ingress", () => {
    expect(meta).toContain('from "../_shared/content-security-client.ts"');
    expect(meta).toContain("const security = await scanInboundContent({");
    expect(meta).toContain("if (blocksNormalIngress(security.decision))");
    const scan = meta.indexOf("const security = await scanInboundContent({");
    const claim = meta.indexOf("const claim = await claimEvent(sb, params.provider");
    expect(scan).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(scan);
  });
});
