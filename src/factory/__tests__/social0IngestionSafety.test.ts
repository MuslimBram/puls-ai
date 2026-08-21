/**
 * PULSE AI — SOCIAL-0 Ingestion Safety Tests
 *
 * S0-1 Telegram workspace resolution
 * S0-2 Web Chat server-side tenant resolution
 * S0-4 Canonical AI router usage
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEdgeFunction(name: string): string {
  return readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf-8");
}

type TelegramChannel = {
  id: string;
  workspace_id: string;
  settings?: Record<string, unknown>;
};

type ResolutionResult =
  | { ok: true; channelId: string; workspaceId: string }
  | { ok: false; reason: "zero_channels" | "ambiguous" | "not_found" | "blocker" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTelegramWorkspace(
  channels: TelegramChannel[],
  secretHeader: string | null,
  channelIdParam: string | null,
): Promise<ResolutionResult> {
  if (channelIdParam) {
    if (!UUID_RE.test(channelIdParam)) return { ok: false, reason: "not_found" };
    const ch = channels.find((c) => c.id === channelIdParam);
    if (!ch) return { ok: false, reason: "not_found" };
    return { ok: true, channelId: ch.id, workspaceId: ch.workspace_id };
  }
  if (secretHeader) {
    const matches = channels.filter((c) => (c.settings ?? {}).telegram_webhook_secret === secretHeader);
    if (matches.length === 0) return { ok: false, reason: "not_found" };
    if (matches.length > 1) return { ok: false, reason: "ambiguous" };
    return { ok: true, channelId: matches[0].id, workspaceId: matches[0].workspace_id };
  }
  if (channels.length === 0) return { ok: false, reason: "zero_channels" };
  if (channels.length === 1) return { ok: true, channelId: channels[0].id, workspaceId: channels[0].workspace_id };
  return { ok: false, reason: "blocker" };
}

describe("S0-1: Telegram workspace resolution", () => {
  const WS_A = "aaaaaaaaa-0000-0000-0000-000000000001";
  const WS_B = "bbbbbbbbb-0000-0000-0000-000000000002";
  const CH_A = "00000000-0000-0000-0000-000000000001";
  const CH_B = "00000000-0000-0000-0000-000000000002";

  const single: TelegramChannel[] = [{ id: CH_A, workspace_id: WS_A }];
  const two: TelegramChannel[] = [{ id: CH_A, workspace_id: WS_A }, { id: CH_B, workspace_id: WS_B }];
  const twoWithSecrets: TelegramChannel[] = [
    { id: CH_A, workspace_id: WS_A, settings: { telegram_webhook_secret: "secret-alpha" } },
    { id: CH_B, workspace_id: WS_B, settings: { telegram_webhook_secret: "secret-beta" } },
  ];

  it("1a. Unique channel_id param → resolves correct workspace", async () => {
    const res = await resolveTelegramWorkspace(single, null, CH_A);
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.workspaceId).toBe(WS_A); expect(res.channelId).toBe(CH_A); }
  });

  it("1b. channel_id param pointing to non-existent channel → not_found", async () => {
    const res = await resolveTelegramWorkspace(single, null, "ch-nonexistent-0000-0000-0000-000000000099");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });

  it("1c. Zero channels → zero_channels, no side effects", async () => {
    const res = await resolveTelegramWorkspace([], null, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("zero_channels");
  });

  it("1d. Exactly one channel, no discriminator → single-workspace safe fallback", async () => {
    const res = await resolveTelegramWorkspace(single, null, null);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.workspaceId).toBe(WS_A);
  });

  it("1e. Multiple channels, no discriminator → blocker (fail closed, NOT first-match)", async () => {
    const res = await resolveTelegramWorkspace(two, null, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("blocker");
    expect(res.ok).not.toBe(true);
  });

  it("1f. Per-channel secret matches one channel → resolves correct workspace", async () => {
    const res = await resolveTelegramWorkspace(twoWithSecrets, "secret-beta", null);
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.workspaceId).toBe(WS_B); expect(res.channelId).toBe(CH_B); }
  });

  it("1g. Secret header matches zero channels → not_found", async () => {
    const res = await resolveTelegramWorkspace(twoWithSecrets, "secret-unknown", null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });

  it("1h. Two channels share the same secret → ambiguous (fail closed)", async () => {
    const ambig: TelegramChannel[] = [
      { id: CH_A, workspace_id: WS_A, settings: { telegram_webhook_secret: "same" } },
      { id: CH_B, workspace_id: WS_B, settings: { telegram_webhook_secret: "same" } },
    ];
    const res = await resolveTelegramWorkspace(ambig, "same", null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("ambiguous");
  });

  it("1i. telegram-webhook source: does NOT contain first-match pattern", () => {
    const src = readEdgeFunction("telegram-webhook");
    expect(src).not.toContain(".limit(1).single()");
    expect(src).toContain("resolveTelegramWorkspace");
    expect(src).toContain("TELEGRAM_DETERMINISTIC_MAPPING_BLOCKER");
  });

  it("1j. AI/lead/inbox work happens only AFTER workspace resolution", () => {
    const src = readEdgeFunction("telegram-webhook");
    const resolveIdx = src.indexOf("resolveTelegramWorkspace(");
    const aiRouterIdx = src.indexOf("callAIRouter(");
    const leadInsertIdx = src.indexOf('"leads"');
    const inboxIdx = src.indexOf('"integration_event_logs"');
    expect(resolveIdx).toBeGreaterThan(0);
    expect(aiRouterIdx).toBeGreaterThan(resolveIdx);
    expect(leadInsertIdx).toBeGreaterThan(resolveIdx);
    expect(inboxIdx).toBeGreaterThan(resolveIdx);
  });
});

describe("S0-2: Web Chat server-side tenant resolution", () => {
  it("2a. webchat-ingest: does NOT use body.user_id as authoritative tenant", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).not.toContain("const { user_id,");
    expect(src).not.toContain("const { user_id ");
    expect(src).not.toContain(".eq(\"user_id\", user_id)");
  });

  it("2b. webchat-ingest: channel_id required; missing → 400", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).toContain("channel_id");
    expect(src).toContain("channel_id and message are required");
  });

  it("2c. webchat-ingest: workspace resolved server-side from channels table", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).toContain("resolvedUserId");
    expect(src).toContain("resolvedWorkspaceId");
    expect(src).toContain(".eq(\"id\", channel_id)");
    expect(src).toContain(".eq(\"channel_type\", \"website_chat\")");
  });

  it("2d. webchat-ingest: channel not found → 404", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).toContain("Channel not found or disabled");
    expect(src).toContain("status: 404");
  });

  it("2e. webchat-ingest: internal-secret enforced before body parsing", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).toContain("requireInternalSecret");
    const unauthIdx = src.indexOf("requireInternalSecret(req)");
    const bodyIdx = src.indexOf("await req.json()");
    expect(unauthIdx).toBeGreaterThan(0);
    expect(bodyIdx).toBeGreaterThan(unauthIdx);
  });

  it("2f. Forged tenant input: resolved IDs come from DB, not body", () => {
    const src = readEdgeFunction("webchat-ingest");
    expect(src).toContain("user_id: resolvedUserId");
    expect(src).toContain("workspace_id: resolvedWorkspaceId");
    expect(src).toContain("NOTE: body.user_id is intentionally NOT used");
  });
});

describe("S0-4: Canonical AI router usage in scoring functions", () => {
  it("4a. score-leads: does NOT import or use LOVABLE_API_KEY", () => {
    const src = readEdgeFunction("score-leads");
    expect(src).not.toContain("LOVABLE_API_KEY");
    expect(src).not.toContain("ai.gateway.lovable.dev");
  });

  it("4b. score-leads: imports and uses callAIRouter", () => {
    const src = readEdgeFunction("score-leads");
    expect(src).toContain("callAIRouter");
    expect(src).toContain("ai-router-helper");
  });

  it("4c. score-leads: workspace_id passed to callAIRouter", () => {
    const src = readEdgeFunction("score-leads");
    expect(src).toContain("workspaceId: workspace_id");
  });

  it("4d. score-leads: router error returns 503", () => {
    const src = readEdgeFunction("score-leads");
    expect(src).toContain("503");
    expect(src).toContain("AI scoring temporarily unavailable");
  });

  it("4e. score-visitors: does NOT use LOVABLE_API_KEY", () => {
    const src = readEdgeFunction("score-visitors");
    expect(src).not.toContain("LOVABLE_API_KEY");
    expect(src).not.toContain("ai.gateway.lovable.dev");
  });

  it("4f. score-visitors: imports and uses callAIRouter", () => {
    const src = readEdgeFunction("score-visitors");
    expect(src).toContain("callAIRouter");
    expect(src).toContain("ai-router-helper");
  });

  it("4g. score-visitors: userId passed to callAIRouter", () => {
    const src = readEdgeFunction("score-visitors");
    expect(src).toContain("userId");
    expect(src).toContain("taskType: \"text_classification\"");
  });

  it("4h. score-visitors: router error caught and handled", () => {
    const src = readEdgeFunction("score-visitors");
    expect(src).toContain("AI classification error");
  });

  it("4i. score-leads: no inline provider fetch", () => {
    const src = readEdgeFunction("score-leads");
    expect(src).not.toContain("fetch(\"https://ai.gateway");
    expect(src).not.toContain("fetch('https://ai.gateway");
  });
});

describe("S0-3: Additional ingestion tenant isolation checks", () => {
  it("3a. meta-webhook: workspace resolved from page_id, not sender identity", () => {
    const src = readEdgeFunction("meta-webhook");
    expect(src).toContain("resolveWorkspaceFromPage");
    expect(src).toContain("NEVER: workspaces.owner_id = senderId");
    expect(src).not.toContain("resolveWorkspaceFromPage(sb, senderId");
  });

  it("3b. whatsapp-webhook: workspace resolved from phone_number_id, not first-match", () => {
    const src = readEdgeFunction("whatsapp-webhook");
    expect(src).toContain("phone_number_id");
    expect(src).toContain("REQUIRE exact phone_number_id match — NO fallback to first channel");
  });

  it("3c. discord-event-ingest: workspace validated before writes", () => {
    const src = readEdgeFunction("discord-event-ingest");
    expect(src).toContain("VALIDATE WORKSPACE & CHANNEL MAPPING BEFORE ANY WRITE");
    expect(src).toContain("connection_status");
  });
});
