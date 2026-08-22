import { describe, expect, it, vi } from "vitest";

import {
  buildMemoryContextBlock,
  classifyFactualStatus,
  createPublicMemoryDenied,
  dedupeAndRankMemory,
  normalizeMemoryLimit,
  retrieveUnifiedMemory,
  sanitizeMemoryText,
  type PulseMemoryAdapter,
  type PulseMemoryEntry,
} from "../../../supabase/functions/_shared/pulse-memory-facade";

function emptyAdapter(overrides: Partial<PulseMemoryAdapter> = {}): PulseMemoryAdapter {
  return {
    verifyContact: vi.fn(async (_workspaceId: string, contactId: string) => ({
      ok: true,
      scoped: true,
      resolvedIdentifier: contactId,
    })),
    verifyConversation: vi.fn(async () => ({ ok: true, scoped: true })),
    fetchBusinessProfiles: vi.fn(async () => ({ ok: true, rows: [] })),
    fetchConversationMemory: vi.fn(async () => ({ ok: true, rows: [] })),
    fetchConversationThread: vi.fn(async () => ({ ok: true, rows: [] })),
    fetchEnrichedContact: vi.fn(async () => ({ ok: true, rows: [] })),
    fetchKnowledge: vi.fn(async () => ({ ok: true, rows: [] })),
    fetchInterestMemory: vi.fn(async () => ({ ok: true, rows: [] })),
    ...overrides,
  };
}

const auth = {
  type: "user_jwt" as const,
  workspaceVerified: true,
  userId: "user-1",
};

describe("AI-4 canonical memory contract", () => {
  it("uses a bounded default limit", () => {
    expect(normalizeMemoryLimit(undefined)).toBe(12);
  });

  it("clamps excessive limits", () => {
    expect(normalizeMemoryLimit(999)).toBe(30);
  });

  it("clamps non-positive limits", () => {
    expect(normalizeMemoryLimit(0)).toBe(1);
  });

  it("public context is deterministically denied", () => {
    const denied = createPublicMemoryDenied();
    expect(denied.success).toBe(false);
    expect(denied.denied).toBe(true);
    expect(denied.errorCode).toBe("PUBLIC_CONTEXT_PRIVATE_MEMORY_DENIED");
    expect(denied.entries).toEqual([]);
  });

  it("retrieveUnifiedMemory never calls private sources for public callers", async () => {
    const adapter = emptyAdapter();
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "forged-workspace",
      authContext: { type: "public_unauthenticated", workspaceVerified: false },
    });
    expect(response.errorCode).toBe("PUBLIC_CONTEXT_PRIVATE_MEMORY_DENIED");
    expect(adapter.fetchBusinessProfiles).not.toHaveBeenCalled();
    expect(adapter.fetchConversationMemory).not.toHaveBeenCalled();
    expect(adapter.fetchKnowledge).not.toHaveBeenCalled();
  });

  it("rejects private memory without verified workspace scope", async () => {
    const response = await retrieveUnifiedMemory(emptyAdapter(), {
      workspaceId: "ws-a",
      authContext: { type: "user_jwt", workspaceVerified: false, userId: "user-1" },
    });
    expect(response.errorCode).toBe("WORKSPACE_SCOPE_NOT_VERIFIED");
    expect(response.entries).toEqual([]);
  });

  it("rejects a forged/cross-workspace contact reference", async () => {
    const adapter = emptyAdapter({
      verifyContact: vi.fn(async () => ({ ok: true, scoped: false })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      contactId: "contact-from-ws-b",
    });
    expect(response.errorCode).toBe("REFERENCE_SCOPE_MISMATCH");
    expect(response.entries).toEqual([]);
    expect(adapter.fetchConversationMemory).not.toHaveBeenCalled();
  });

  it("rejects a forged/cross-workspace conversation reference", async () => {
    const adapter = emptyAdapter({
      verifyConversation: vi.fn(async () => ({ ok: true, scoped: false })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      conversationId: "thread-from-ws-b",
    });
    expect(response.errorCode).toBe("REFERENCE_SCOPE_MISMATCH");
    expect(response.entries).toEqual([]);
  });

  it("passes only the verified workspace to every source adapter", async () => {
    const adapter = emptyAdapter();
    await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["BUSINESS", "CONVERSATION", "KNOWLEDGE", "INTERACTION"],
    });
    expect(adapter.fetchBusinessProfiles).toHaveBeenCalledWith("ws-a", expect.any(Number));
    expect(adapter.fetchConversationMemory).toHaveBeenCalledWith("ws-a", undefined, expect.any(Number));
    expect(adapter.fetchKnowledge).toHaveBeenCalledWith("ws-a", expect.any(Number));
    expect(adapter.fetchInterestMemory).toHaveBeenCalledWith("ws-a", expect.any(Number));
  });

  it("service-role/internal context still requires a verified workspace scope", async () => {
    const response = await retrieveUnifiedMemory(emptyAdapter(), {
      workspaceId: "ws-a",
      authContext: { type: "internal_service", workspaceVerified: false },
    });
    expect(response.errorCode).toBe("WORKSPACE_SCOPE_NOT_VERIFIED");
  });

  it("internal context works when the application explicitly verified the workspace", async () => {
    const response = await retrieveUnifiedMemory(emptyAdapter(), {
      workspaceId: "ws-a",
      authContext: { type: "internal_service", workspaceVerified: true },
    });
    expect(response.success).toBe(true);
  });
});

describe("AI-4 source normalization and provenance", () => {
  it("normalizes business profile facts with provenance", async () => {
    const adapter = emptyAdapter({
      fetchBusinessProfiles: vi.fn(async () => ({
        ok: true,
        rows: [{
          id: "bp-1",
          business_name: "Pulse Demo",
          industry: "SaaS",
          short_description: "AI business OS",
          updated_at: "2026-08-22T10:00:00Z",
        }],
      })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["BUSINESS"],
    });
    expect(response.entries).toHaveLength(1);
    expect(response.entries[0].memoryType).toBe("BUSINESS");
    expect(response.entries[0].factualStatus).toBe("FACT");
    expect(response.entries[0].provenance.source).toBe("business_profiles");
    expect(response.entries[0].provenance.workspaceId).toBe("ws-a");
  });

  it("marks AI conversation summaries as AI_INFERENCE", async () => {
    const adapter = emptyAdapter({
      fetchConversationMemory: vi.fn(async () => ({
        ok: true,
        rows: [{
          id: "m-1",
          contact_identifier: "contact-1",
          memory_type: "conversation",
          summary: "Customer may prefer annual billing",
          key_facts: ["interested in annual plan"],
          updated_at: "2026-08-22T10:00:00Z",
        }],
      })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["CONVERSATION"],
    });
    expect(response.entries[0].factualStatus).toBe("AI_INFERENCE");
  });

  it("marks enriched contact aggregates as OBSERVATION", async () => {
    const adapter = emptyAdapter({
      verifyContact: vi.fn(async () => ({ ok: true, scoped: true, resolvedIdentifier: "ada@example.com" })),
      fetchEnrichedContact: vi.fn(async () => ({
        ok: true,
        rows: [{
          id: "ec-1",
          contact_identifier: "ada@example.com",
          contact_name: "Ada",
          total_messages: 12,
          tags: ["warm"],
        }],
      })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      contactId: "ec-1",
      memoryTypes: ["CRM"],
    });
    expect(response.entries[0].factualStatus).toBe("OBSERVATION");
  });

  it("marks social interest signals as OBSERVATION without actor identifiers", async () => {
    const adapter = emptyAdapter({
      fetchInterestMemory: vi.fn(async () => ({
        ok: true,
        rows: [{
          id: "interest-1",
          interest_type: "product",
          interest_ref: "analytics",
          evidence_count: 3,
          strength: 0.8,
          source_provider: "instagram",
        }],
      })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["INTERACTION"],
    });
    expect(response.entries[0].factualStatus).toBe("OBSERVATION");
    expect(response.entries[0].content).not.toContain("actor_provider_id");
  });

  it("preserves knowledge provenance", async () => {
    const adapter = emptyAdapter({
      fetchKnowledge: vi.fn(async () => ({
        ok: true,
        rows: [{
          id: "chunk-1",
          source_id: "source-1",
          content: "Refunds are handled according to the approved policy.",
          page_title: "Refund Policy",
        }],
      })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["KNOWLEDGE"],
    });
    expect(response.entries[0].provenance.source).toBe("knowledge_chunks");
    expect(response.entries[0].provenance.sourceRecordId).toBe("chunk-1");
  });

  it("optional source failure is fail-soft, not fail-open", async () => {
    const adapter = emptyAdapter({
      fetchKnowledge: vi.fn(async () => ({ ok: false, rows: [], error: "table unavailable" })),
    });
    const response = await retrieveUnifiedMemory(adapter, {
      workspaceId: "ws-a",
      authContext: auth,
      memoryTypes: ["KNOWLEDGE"],
    });
    expect(response.success).toBe(true);
    expect(response.entries).toEqual([]);
    expect(response.sourceStatus.knowledge_chunks).toBe("UNAVAILABLE");
    expect(response.warnings.join(" ")).toContain("continued without widening scope");
  });

  it("does not invent a workspace mapping for business_memory/customer_journey", async () => {
    const response = await retrieveUnifiedMemory(emptyAdapter(), {
      workspaceId: "ws-a",
      authContext: auth,
    });
    expect(response.sourceStatus.business_memory).toBe("NOT_USED");
    expect(response.sourceStatus.customer_journey).toBe("NOT_USED");
    expect(response.warnings.join(" ")).toContain("does not invent a workspace mapping");
  });
});

describe("AI-4 bounded context and factual status", () => {
  const entry = (id: string, content: string): PulseMemoryEntry => ({
    id,
    memoryType: "KNOWLEDGE",
    source: "knowledge_chunks",
    subject: `subject-${id}`,
    content,
    relevance: 0,
    factualStatus: "FACT",
    provenance: {
      source: "knowledge_chunks",
      sourceRecordId: id,
      workspaceId: "ws-a",
      factualStatus: "FACT",
    },
  });

  it("deduplicates identical memory", () => {
    const ranked = dedupeAndRankMemory([entry("1", "same"), entry("1", "same")], "same", 10);
    expect(ranked).toHaveLength(1);
  });

  it("ranks query matches ahead of unrelated context", () => {
    const ranked = dedupeAndRankMemory(
      [entry("1", "shipping policy"), entry("2", "annual billing discount")],
      "annual billing",
      10,
    );
    expect(ranked[0].id).toBe("2");
  });

  it("enforces final result limits", () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(String(i), `memory ${i}`));
    expect(dedupeAndRankMemory(entries, undefined, 5)).toHaveLength(5);
  });

  it("redacts bearer tokens", () => {
    expect(sanitizeMemoryText("Bearer abcdefghijklmnop secret")).toContain("[REDACTED_BEARER]");
  });

  it("redacts common API-secret shapes", () => {
    expect(sanitizeMemoryText("sk_abcdefghijklmnopqrstuvwxyz")).toBe("[REDACTED_SECRET]");
  });

  it("classifies explicit AI sources as inference", () => {
    expect(classifyFactualStatus("ai_profile_summary")).toBe("AI_INFERENCE");
  });

  it("classifies interest sources as observation", () => {
    expect(classifyFactualStatus("social_interest_memory")).toBe("OBSERVATION");
  });

  it("classifies structured canonical source as fact", () => {
    expect(classifyFactualStatus("business_profiles")).toBe("FACT");
  });

  it("context block warns that AI inference is not verified fact", () => {
    const block = buildMemoryContextBlock({
      success: true,
      workspaceId: "ws-a",
      entries: [entry("1", "approved documentation")],
      warnings: [],
      sourceStatus: {},
    });
    expect(block).toContain("AI_INFERENCE entries are not verified facts");
  });

  it("failed/denied memory never enters the AI context block", () => {
    const block = buildMemoryContextBlock({
      success: false,
      workspaceId: "ws-a",
      entries: [entry("1", "should not appear")],
      warnings: [],
      sourceStatus: {},
    });
    expect(block).toBe("");
  });

  it("context block remains bounded", () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(String(i), "x".repeat(900)));
    const block = buildMemoryContextBlock({
      success: true,
      workspaceId: "ws-a",
      entries,
      warnings: [],
      sourceStatus: {},
    });
    expect(block.length).toBeLessThanOrEqual(5_700);
  });
});
