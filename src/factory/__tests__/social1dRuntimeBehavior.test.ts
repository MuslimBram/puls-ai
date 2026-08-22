import { describe, expect, it, vi } from "vitest";
import {
  EVIDENCE_DIRECTIONS,
  EVIDENCE_WEIGHTS,
  MIN_RECENCY_FACTOR,
  RECENCY_HALF_LIFE_DAYS,
  buildEvidenceIdempotencyKey,
  classifyContentSignals,
  computeIntentScoreLocally,
  computeRecencyFactor,
  extractEvidenceFromEvent,
  extractEvidenceFromInterestMemory,
} from "../../../supabase/functions/_shared/social-intent-signals";
import {
  processIntentScore,
  refreshIntentEvidenceRecency,
  revokeIntentEvidence,
  type RuntimeScoreComputeInput,
} from "../../../supabase/functions/_shared/social-intent-runtime";
import type { IntentEvidenceContribution } from "../../../supabase/functions/_shared/social-intent-score";

const now = "2026-08-22T12:00:00.000Z";
const input = (overrides: Partial<RuntimeScoreComputeInput> = {}): RuntimeScoreComputeInput => ({
  workspace_id: "ws-1",
  resolved_identity_key: "actor:meta_ig:page:user",
  identity_state: "platform_actor",
  interest_memory_rows: [],
  engagement_events: [],
  as_of: now,
  ...overrides,
});

describe("SOCIAL-1D recency", () => {
  it("fresh evidence = 1", () => expect(computeRecencyFactor(now, now)).toBe(1));
  it("one half-life = 0.5", () => {
    const old = new Date(Date.parse(now) - RECENCY_HALF_LIFE_DAYS * 86_400_000).toISOString();
    expect(computeRecencyFactor(old, now)).toBe(0.5);
  });
  it("older evidence contributes less", () => {
    const old = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
    expect(computeRecencyFactor(old, now)).toBeLessThan(1);
  });
  it("invalid time fails conservatively", () => {
    expect(computeRecencyFactor("invalid", now)).toBe(MIN_RECENCY_FACTOR);
  });
});

describe("SOCIAL-1D content signals", () => {
  it("detects pricing EN/SQ", () => {
    expect(classifyContentSignals("How much does it cost?")).toContain("pricing_inquiry");
    expect(classifyContentSignals("Sa kushton kjo?")).toContain("pricing_inquiry");
  });
  it("detects demo/booking", () => {
    expect(classifyContentSignals("Can I book a demo meeting?")).toContain("demo_booking_request");
  });
  it("detects purchase language", () => {
    expect(classifyContentSignals("I want to buy this")).toContain("purchase_related_language");
  });
  it("detects objections", () => {
    expect(classifyContentSignals("This is too expensive")).toContain("objection_signal");
  });
  it("support-only is not commercial intent", () => {
    expect(classifyContentSignals("Help, this is not working")).toContain("support_only_language");
    expect(classifyContentSignals("Help me buy this")).not.toContain("support_only_language");
  });
  it("stacks explicit commercial signals", () => {
    expect(classifyContentSignals("How much is it and can I book a demo to buy it?")).toEqual(
      expect.arrayContaining(["pricing_inquiry", "demo_booking_request", "purchase_related_language"]),
    );
  });
});

describe("SOCIAL-1D evidence extraction", () => {
  it("message_received yields inbound + explicit signals", () => {
    const result = extractEvidenceFromEvent({
      id: "evt-1",
      event_type: "message_received",
      content_ref: "How much? I want to buy it",
      event_timestamp: now,
      source_ref: "meta:evt-1",
    }, now);
    expect(result.map((x) => x.evidence_type)).toEqual(
      expect.arrayContaining(["inbound_message", "pricing_inquiry", "purchase_related_language"]),
    );
  });
  it("passive/non-message event does not create intent", () => {
    expect(extractEvidenceFromEvent({
      id: "evt-view",
      event_type: "view",
      content_ref: null,
      event_timestamp: now,
      source_ref: "meta:view",
    }, now)).toEqual([]);
  });
  it("active product memory yields explicit interest and repeated signal", () => {
    const result = extractEvidenceFromInterestMemory([{
      id: "mem-1",
      interest_type: "product",
      interest_ref: "pro-plan",
      evidence_count: 3,
      strength: 0.8,
      first_seen_at: now,
      last_seen_at: now,
      state: "active",
    }], now);
    expect(result.map((x) => x.evidence_type)).toEqual([
      "explicit_product_interest",
      "repeated_interest_signal",
    ]);
  });
  it("revoked/expired or id-less memory is ignored", () => {
    expect(extractEvidenceFromInterestMemory([{
      interest_type: "product",
      interest_ref: "x",
      evidence_count: 3,
      strength: 1,
      first_seen_at: now,
      last_seen_at: now,
      state: "active",
    }], now)).toEqual([]);
    expect(extractEvidenceFromInterestMemory([{
      id: "mem-x",
      interest_type: "product",
      interest_ref: "x",
      evidence_count: 3,
      strength: 1,
      first_seen_at: now,
      last_seen_at: now,
      state: "revoked",
    }], now)).toEqual([]);
  });
});

describe("SOCIAL-1D local score", () => {
  const contribution = (type: keyof typeof EVIDENCE_WEIGHTS, recency = 1): IntentEvidenceContribution => ({
    evidence_type: type,
    direction: EVIDENCE_DIRECTIONS[type],
    weight: EVIDENCE_WEIGHTS[type],
    contribution: EVIDENCE_DIRECTIONS[type] === "negative"
      ? -EVIDENCE_WEIGHTS[type] * recency
      : EVIDENCE_WEIGHTS[type] * recency,
    source_ref: `src:${type}`,
    evidence_timestamp: now,
    recency_factor: recency,
  });
  it("pricing + demo are deterministic", () => {
    expect(computeIntentScoreLocally([
      contribution("pricing_inquiry"), contribution("demo_booking_request"),
    ]).score).toBe(0.57);
  });
  it("objection reduces intent", () => {
    const positive = computeIntentScoreLocally([contribution("pricing_inquiry"), contribution("demo_booking_request")]);
    const negative = computeIntentScoreLocally([
      contribution("pricing_inquiry"), contribution("demo_booking_request"), contribution("objection_signal"),
    ]);
    expect(negative.score).toBeLessThan(positive.score);
  });
  it("support-only cannot inflate intent", () => {
    expect(computeIntentScoreLocally([contribution("support_only_language")]).score).toBe(0);
  });
  it("score is bounded", () => {
    expect(computeIntentScoreLocally([
      contribution("purchase_related_language"),
      contribution("purchase_related_language"),
      contribution("demo_booking_request"),
    ]).score).toBe(1);
  });
  it("stale evidence contributes less but remains counted", () => {
    const fresh = computeIntentScoreLocally([contribution("purchase_related_language", 1)]);
    const stale = computeIntentScoreLocally([contribution("purchase_related_language", 0.25)]);
    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.evidence_count).toBe(1);
  });
});

describe("SOCIAL-1D idempotency", () => {
  const event = { evidence_type: "pricing_inquiry" as const, engagement_event_id: "evt-1", source_ref: "meta:1" };
  it("same evidence has same key", () => {
    expect(buildEvidenceIdempotencyKey("ws-1", "actor-1", event)).toBe(
      buildEvidenceIdempotencyKey("ws-1", "actor-1", event),
    );
  });
  it("cross-workspace key differs", () => {
    expect(buildEvidenceIdempotencyKey("ws-1", "actor-1", event)).not.toBe(
      buildEvidenceIdempotencyKey("ws-2", "actor-1", event),
    );
  });
});

describe("SOCIAL-1D processIntentScore", () => {
  it("anonymous aggregate is skipped", async () => {
    const rpc = vi.fn();
    expect(await processIntentScore(input({ identity_state: "anonymous_aggregate" }), { rpc })).toEqual({
      status: "skipped_anonymous", evidence_inserted: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("known person requires canonical id", async () => {
    const rpc = vi.fn();
    expect((await processIntentScore(input({ identity_state: "known_person" }), { rpc })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("non-known identity cannot inject canonical person", async () => {
    const rpc = vi.fn();
    expect((await processIntentScore(input({ canonical_person_id: "forged" }), { rpc })).status).toBe("error");
  });
  it("pricing message calls atomic persistence for inbound + pricing", async () => {
    const rpc = vi.fn(async () => ({ data: { evidence_inserted: true }, error: null }));
    const result = await processIntentScore(input({ engagement_events: [{
      id: "evt-p", event_type: "message_received", content_ref: "What is the price?",
      event_timestamp: now, source_ref: "meta:p",
    }] }), { rpc });
    expect(result.status).toBe("scored");
    expect(result.evidence_inserted).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("duplicate retry reports zero inserted", async () => {
    const rpc = vi.fn(async () => ({ data: { evidence_inserted: false }, error: null }));
    const result = await processIntentScore(input({ engagement_events: [{
      id: "evt-d", event_type: "message_received", content_ref: "hello",
      event_timestamp: now, source_ref: "meta:d",
    }] }), { rpc });
    expect(result.status).toBe("scored");
    expect(result.evidence_inserted).toBe(0);
  });
  it("DB error does not invent success", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "down" } }));
    const result = await processIntentScore(input({ engagement_events: [{
      id: "evt-f", event_type: "message_received", content_ref: "hello",
      event_timestamp: now, source_ref: "meta:f",
    }] }), { rpc });
    expect(result.status).toBe("error");
  });
});

describe("SOCIAL-1D recency/revocation wrappers", () => {
  it("refresh uses deterministic recency", async () => {
    const rpc = vi.fn(async () => ({ data: { updated: true }, error: null }));
    await refreshIntentEvidenceRecency({ rpc }, "ws-1", "ev-1", "2026-08-15T12:00:00Z", now);
    expect(rpc).toHaveBeenCalledWith("refresh_social_intent_evidence_recency", expect.objectContaining({
      p_workspace_id: "ws-1", p_evidence_id: "ev-1", p_recency_factor: 0.5,
    }));
  });
  it("revocation stays workspace-scoped", async () => {
    const rpc = vi.fn(async () => ({ data: { revoked: true }, error: null }));
    await revokeIntentEvidence({ rpc }, { workspace_id: "ws-1", evidence_id: "ev-1", reason: "link revoked" });
    expect(rpc).toHaveBeenCalledWith("revoke_social_intent_evidence", expect.objectContaining({
      p_workspace_id: "ws-1", p_evidence_id: "ev-1",
    }));
  });
});
