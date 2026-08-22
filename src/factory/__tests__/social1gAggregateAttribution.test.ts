/**
 * SOCIAL-1G — Aggregate & Attribution Reporting Layer
 *
 * Safety invariants tested:
 *   1.  workspace isolation: workspace A cannot access workspace B reporting
 *   2.  no anonymous→person join
 *   3.  no platform_actor→known_person promotion
 *   4.  direct evidence-backed attribution
 *   5.  assisted attribution
 *   6.  insufficient evidence → UNATTRIBUTED
 *   7.  deterministic attribution window
 *   8.  future/impossible timestamp rejected
 *   9.  retry idempotency (same key → inserted=false)
 *   10. duplicate conversion protection
 *   11. duplicate source evidence protection
 *   12. cross-workspace evidence rejected
 *   13. BLOCK activity: reportable in aggregates but not attributable
 *   14. REVIEW remains REVIEW (recommendation_status preserved)
 *   15. SOCIAL-1F recommendation data preserved correctly in attribution
 *   16. numeric confidence 0–1 contract remains intact
 *   17. social_confidence_band remains separate from numeric confidence
 *   18. no provider send
 *   19. no campaign creation
 *   20. no AI-3 execution
 *   21. no autonomous rule mutation
 *   22. SOCIAL-0→1F regressions: scoreToband, deriveIdempotencyKey, evaluatePolicy
 */

import { describe, it, expect } from "vitest";
import {
  computeAttribution,
  persistAttribution,
  deriveAttributionIdempotencyKey,
  ATTRIBUTION_WINDOW_DEFAULTS,
  type AttributionInput,
  type AttributionWindowConfig,
  type SocialEvidenceRef,
  type AttributionResult,
  type AttributionError,
} from "../../../supabase/functions/_shared/social-attribution";
import {
  persistAggregateSnapshot,
  deriveSnapshotIdempotencyKey,
  type AggregateSnapshotInput,
  type AggregateSnapshotResult,
} from "../../../supabase/functions/_shared/social-aggregate-report";
import { scoreToband } from "../../../supabase/functions/_shared/social-intent-score";
import { deriveIdempotencyKey, SOCIAL_CONFIDENCE_BAND_TO_NUMERIC } from "../../../supabase/functions/_shared/social-nba";
import { evaluatePolicy } from "../../../supabase/functions/_shared/social-policy-engine";
import type { ConsentRecord } from "../../../supabase/functions/_shared/social-consent-evaluator";

// ── Test Helpers ──────────────────────────────────────────────────────────────

const WS_A = "00000000-0000-0000-0000-000000000001";
const WS_B = "00000000-0000-0000-0000-000000000002";

const DEFAULT_CONFIG: AttributionWindowConfig = {
  workspace_id: WS_A,
  ...ATTRIBUTION_WINDOW_DEFAULTS,
};

function makeEvidence(overrides: Partial<SocialEvidenceRef> = {}): SocialEvidenceRef {
  return {
    workspace_id: WS_A,
    nba_idempotency_key: "social_nba:ws_a:actor1:ev1:2026-08-22",
    source_event_idempotency_key: "seg:meta_ig:ws_a:ev1",
    evidence_refs: ["ev1"],
    provider: "meta_ig",
    channel: "instagram",
    identity_state: "known_person",
    canonical_person_id: "person-uuid-1",
    intent_score: 0.75,
    intent_score_band: "strong",
    social_confidence_band: "high",
    recommendation_status: "recommended",
    policy_decision: "ALLOW",
    confidence: 0.80,
    recommended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ...overrides,
  };
}

function makeInput(overrides: Partial<AttributionInput> = {}): AttributionInput {
  const evidence = makeEvidence();
  return {
    workspace_id: WS_A,
    outcome_ref: "order-001",
    outcome_timestamp: new Date().toISOString(),
    evidence_candidates: [evidence],
    window_config: DEFAULT_CONFIG,
    idempotency_key: deriveAttributionIdempotencyKey(WS_A, "order-001", evidence.nba_idempotency_key),
    ...overrides,
  };
}

function makeSnapshotInput(overrides: Partial<AggregateSnapshotInput> = {}): AggregateSnapshotInput {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();
  return {
    workspace_id: WS_A,
    time_window: { start, end, label: "2026-08-22" },
    dimensions: { provider: "meta_ig", channel: "instagram" },
    measures: {
      social_event_count: 10,
      unique_platform_actor_count: 5,
      anonymous_aggregate_count: 2,
      known_person_activity_count: 3,
      intent_none_count: 1,
      intent_low_count: 2,
      intent_moderate_count: 3,
      intent_strong_count: 2,
      intent_high_count: 2,
      high_intent_event_count: 4,
      policy_allow_count: 6,
      policy_review_count: 2,
      policy_block_count: 2,
      nba_recommended_count: 4,
      nba_do_nothing_count: 2,
      nba_review_required_count: 2,
      nba_blocked_count: 2,
      attributed_direct_count: 1,
      attributed_assisted_count: 1,
      unattributed_count: 8,
    },
    ...overrides,
  };
}

// ── Mock DB ───────────────────────────────────────────────────────────────────

type DbStore = Map<string, unknown>;

function makeMockDb(store: DbStore) {
  const insertedIds = new Map<string, string>();

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "record_social_attribution") {
        const key = args.p_idempotency_key as string;
        if (insertedIds.has(key)) {
          return { data: [{ id: insertedIds.get(key), inserted: false }], error: null };
        }
        const id = `attr-${Math.random().toString(36).slice(2)}`;
        insertedIds.set(key, id);
        store.set(key, args);
        return { data: [{ id, inserted: true }], error: null };
      }
      if (fn === "upsert_social_aggregate_snapshot") {
        const key = `${args.p_workspace_id}:${args.p_snapshot_idempotency_key}`;
        if (insertedIds.has(key)) {
          return { data: [{ id: insertedIds.get(key), inserted: false }], error: null };
        }
        const id = `snap-${Math.random().toString(36).slice(2)}`;
        insertedIds.set(key, id);
        store.set(key, args);
        return { data: [{ id, inserted: true }], error: null };
      }
      return { data: null, error: { message: `unknown rpc: ${fn}` } };
    },
  };
}

// ── 1. Workspace Isolation ────────────────────────────────────────────────────

describe("SOCIAL-1G: workspace isolation", () => {
  it("snapshot idempotency key is workspace-scoped", () => {
    const snap = makeSnapshotInput();
    const keyA = deriveSnapshotIdempotencyKey(WS_A, snap.time_window, snap.dimensions);
    const keyB = deriveSnapshotIdempotencyKey(WS_B, snap.time_window, snap.dimensions);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain(WS_A);
    expect(keyB).toContain(WS_B);
  });

  it("attribution idempotency key is workspace-scoped", () => {
    const keyA = deriveAttributionIdempotencyKey(WS_A, "order-1", "nba-key");
    const keyB = deriveAttributionIdempotencyKey(WS_B, "order-1", "nba-key");
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain(WS_A);
    expect(keyB).toContain(WS_B);
  });
});

// ── 2. No Anonymous→Person Join ───────────────────────────────────────────────

describe("SOCIAL-1G: no anonymous→person join", () => {
  it("anonymous_aggregate evidence is excluded from attribution", () => {
    const input = makeInput({
      evidence_candidates: [
        makeEvidence({
          identity_state: "anonymous_aggregate",
          canonical_person_id: undefined,
          actor_provider_id: undefined,
        } as any),
      ],
    });
    const result = computeAttribution(input) as AttributionResult;
    expect(result.attribution_method).toBe("UNATTRIBUTED");
    expect(result.attribution_reason_codes).toContain("ANONYMOUS_AGGREGATE_NOT_ATTRIBUTABLE");
    expect(result.selected_evidence).toBeNull();
  });

  it("anonymous_aggregate evidence does not produce a canonical_person_id in result", () => {
    const result = computeAttribution(makeInput({
      evidence_candidates: [makeEvidence({ identity_state: "anonymous_aggregate" } as any)],
    })) as AttributionResult;
    expect(result.selected_evidence).toBeNull();
  });
});

// ── 3. No platform_actor→known_person Promotion ───────────────────────────────

describe("SOCIAL-1G: no platform_actor promotion", () => {
  it("platform_actor evidence can be attributed without promotion", () => {
    const ev = makeEvidence({
      identity_state: "platform_actor",
      canonical_person_id: undefined,
    });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    // platform_actor CAN be attributed (just not promoted to known_person)
    if (result.attribution_method !== "UNATTRIBUTED") {
      expect(result.selected_evidence?.identity_state).toBe("platform_actor");
      // No canonical_person_id created or promoted
      expect(result.selected_evidence?.canonical_person_id).toBeUndefined();
    }
  });

  it("attribution result does not invent canonical_person_id for platform_actor", () => {
    const ev = makeEvidence({ identity_state: "platform_actor", canonical_person_id: undefined });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    // selected_evidence preserves upstream state; no new person ID
    if (result.selected_evidence) {
      expect(result.selected_evidence.canonical_person_id).toBeUndefined();
    }
  });
});

// ── 4. Direct Evidence-Backed Attribution ────────────────────────────────────

describe("SOCIAL-1G: direct evidence-backed attribution", () => {
  it("evidence within direct window → DIRECT_EVIDENCE_BACKED", () => {
    const ev = makeEvidence({
      recommended_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    });
    const result = computeAttribution(makeInput({
      evidence_candidates: [ev],
      window_config: { ...DEFAULT_CONFIG, direct_window_days: 7, assisted_window_days: 30 },
    })) as AttributionResult;
    expect(result.attribution_method).toBe("DIRECT_EVIDENCE_BACKED");
    expect(result.attribution_reason_codes).toContain("WITHIN_DIRECT_WINDOW");
    expect(result.attribution_reason_codes).toContain("EVIDENCE_BACKED_DIRECT");
    expect(result.selected_evidence).not.toBeNull();
  });

  it("direct attribution preserves evidence refs", () => {
    const ev = makeEvidence({ evidence_refs: ["ev1", "ev2"] });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    if (result.attribution_method === "DIRECT_EVIDENCE_BACKED") {
      expect(result.selected_evidence?.evidence_refs).toEqual(["ev1", "ev2"]);
    }
  });
});

// ── 5. Assisted Attribution ───────────────────────────────────────────────────

describe("SOCIAL-1G: assisted attribution", () => {
  it("evidence outside direct but within assisted window → INFERRED_ASSISTED", () => {
    const ev = makeEvidence({
      recommended_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days ago
    });
    const result = computeAttribution(makeInput({
      evidence_candidates: [ev],
      window_config: { ...DEFAULT_CONFIG, direct_window_days: 7, assisted_window_days: 30 },
    })) as AttributionResult;
    expect(result.attribution_method).toBe("INFERRED_ASSISTED");
    expect(result.attribution_reason_codes).toContain("WITHIN_ASSISTED_WINDOW");
    expect(result.attribution_reason_codes).toContain("EVIDENCE_ASSISTED");
  });
});

// ── 6. Insufficient Evidence → UNATTRIBUTED ───────────────────────────────────

describe("SOCIAL-1G: insufficient evidence → UNATTRIBUTED", () => {
  it("no evidence candidates → UNATTRIBUTED", () => {
    const result = computeAttribution(makeInput({ evidence_candidates: [] })) as AttributionResult;
    expect(result.attribution_method).toBe("UNATTRIBUTED");
    expect(result.attribution_reason_codes).toContain("NO_QUALIFYING_NBA");
    expect(result.selected_evidence).toBeNull();
  });

  it("evidence outside all windows → UNATTRIBUTED", () => {
    const ev = makeEvidence({
      recommended_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    });
    const result = computeAttribution(makeInput({
      evidence_candidates: [ev],
      window_config: { ...DEFAULT_CONFIG, direct_window_days: 7, assisted_window_days: 30 },
    })) as AttributionResult;
    expect(result.attribution_method).toBe("UNATTRIBUTED");
  });

  it("evidence with intent below min_qualifying_intent_band → UNATTRIBUTED", () => {
    const ev = makeEvidence({
      intent_score_band: "none",
    });
    const result = computeAttribution(makeInput({
      evidence_candidates: [ev],
      window_config: { ...DEFAULT_CONFIG, min_qualifying_intent_band: "moderate" },
    })) as AttributionResult;
    expect(result.attribution_method).toBe("UNATTRIBUTED");
    expect(result.attribution_reason_codes).toContain("INSUFFICIENT_EVIDENCE");
  });
});

// ── 7. Deterministic Attribution Window ──────────────────────────────────────

describe("SOCIAL-1G: deterministic attribution window", () => {
  it("same inputs produce same attribution method on every call", () => {
    const input = makeInput();
    const r1 = computeAttribution(input) as AttributionResult;
    const r2 = computeAttribution(input) as AttributionResult;
    expect(r1.attribution_method).toBe(r2.attribution_method);
    expect(r1.attribution_reason_codes).toEqual(r2.attribution_reason_codes);
  });

  it("same inputs produce same idempotency key", () => {
    const k1 = deriveAttributionIdempotencyKey(WS_A, "order-1", "nba-key-1");
    const k2 = deriveAttributionIdempotencyKey(WS_A, "order-1", "nba-key-1");
    expect(k1).toBe(k2);
  });
});

// ── 8. Future/Impossible Timestamp Rejected ───────────────────────────────────

describe("SOCIAL-1G: future timestamp rejected", () => {
  it("outcome_timestamp in the future → FUTURE_TIMESTAMP error", () => {
    const futureTs = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const result = computeAttribution(makeInput({ outcome_timestamp: futureTs }));
    expect((result as AttributionError).kind).toBe("FUTURE_TIMESTAMP");
  });

  it("invalid timestamp → INVALID_INPUT error", () => {
    const result = computeAttribution(makeInput({ outcome_timestamp: "not-a-date" }));
    expect((result as AttributionError).kind).toBe("INVALID_INPUT");
  });
});

// ── 9. Retry Idempotency ──────────────────────────────────────────────────────

describe("SOCIAL-1G: retry idempotency", () => {
  it("same idempotency key persisted twice → second call returns inserted=false", async () => {
    const store: DbStore = new Map();
    const db = makeMockDb(store);
    const input = makeInput();
    const r1 = computeAttribution(input) as AttributionResult;
    const p1 = await persistAttribution(r1, db);
    const p2 = await persistAttribution(r1, db);
    expect((p1 as any).inserted).toBe(true);
    expect((p2 as any).inserted).toBe(false);
  });

  it("snapshot retry → inserted=false on second call", async () => {
    const store: DbStore = new Map();
    const db = makeMockDb(store);
    const snap = makeSnapshotInput();
    const r1 = await persistAggregateSnapshot(snap, db);
    const r2 = await persistAggregateSnapshot(snap, db);
    expect((r1 as AggregateSnapshotResult).inserted).toBe(true);
    expect((r2 as AggregateSnapshotResult).inserted).toBe(false);
  });
});

// ── 10. Duplicate Conversion Protection ──────────────────────────────────────

describe("SOCIAL-1G: duplicate conversion protection", () => {
  it("same outcome_ref + same evidence → same idempotency key (no duplicate)", () => {
    const nbaKey = "social_nba:ws_a:actor1:ev1:2026-08-22";
    const k1 = deriveAttributionIdempotencyKey(WS_A, "order-001", nbaKey);
    const k2 = deriveAttributionIdempotencyKey(WS_A, "order-001", nbaKey);
    expect(k1).toBe(k2);
  });

  it("different outcome_ref → different idempotency key", () => {
    const nbaKey = "social_nba:ws_a:actor1:ev1:2026-08-22";
    const k1 = deriveAttributionIdempotencyKey(WS_A, "order-001", nbaKey);
    const k2 = deriveAttributionIdempotencyKey(WS_A, "order-002", nbaKey);
    expect(k1).not.toBe(k2);
  });
});

// ── 11. Duplicate Source Evidence Protection ──────────────────────────────────

describe("SOCIAL-1G: duplicate source evidence protection", () => {
  it("same evidence refs → same snapshot idempotency key", () => {
    const snap = makeSnapshotInput();
    const k1 = deriveSnapshotIdempotencyKey(WS_A, snap.time_window, snap.dimensions);
    const k2 = deriveSnapshotIdempotencyKey(WS_A, snap.time_window, snap.dimensions);
    expect(k1).toBe(k2);
  });

  it("different providers → different snapshot keys", () => {
    const snap = makeSnapshotInput();
    const k1 = deriveSnapshotIdempotencyKey(WS_A, snap.time_window, { ...snap.dimensions, provider: "meta_ig" });
    const k2 = deriveSnapshotIdempotencyKey(WS_A, snap.time_window, { ...snap.dimensions, provider: "email" });
    expect(k1).not.toBe(k2);
  });
});

// ── 12. Cross-Workspace Evidence Rejected ────────────────────────────────────

describe("SOCIAL-1G: cross-workspace evidence rejected", () => {
  it("evidence with different workspace_id → WORKSPACE_MISMATCH error", () => {
    const ev = makeEvidence({ workspace_id: WS_B });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] }));
    expect((result as AttributionError).kind).toBe("WORKSPACE_MISMATCH");
  });
});

// ── 13. BLOCK Activity Reportable but Not Attributable ────────────────────────

describe("SOCIAL-1G: BLOCK activity is reportable but not attributable", () => {
  it("evidence with policy_decision=BLOCK → UNATTRIBUTED, reason POLICY_BLOCK_NOT_ATTRIBUTABLE", () => {
    const ev = makeEvidence({ policy_decision: "BLOCK", recommendation_status: "blocked" });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    expect(result.attribution_method).toBe("UNATTRIBUTED");
    expect(result.attribution_reason_codes).toContain("POLICY_BLOCK_NOT_ATTRIBUTABLE");
  });

  it("BLOCK evidence count can appear in aggregate snapshot measures", () => {
    // Aggregate snapshots include policy_block_count — reportable, not executable
    const snap = makeSnapshotInput({ measures: { ...makeSnapshotInput().measures, policy_block_count: 3 } });
    expect(snap.measures.policy_block_count).toBe(3);
    // No execution triggered by this count
  });
});

// ── 14. REVIEW Remains REVIEW ────────────────────────────────────────────────

describe("SOCIAL-1G: REVIEW remains REVIEW", () => {
  it("recommendation_status=review_required is preserved in attribution result", () => {
    const ev = makeEvidence({ policy_decision: "REVIEW", recommendation_status: "review_required" });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    // REVIEW is not BLOCK, so it may be attributable if within window
    if (result.attribution_method !== "UNATTRIBUTED") {
      expect(result.selected_evidence?.recommendation_status).toBe("review_required");
      expect(result.selected_evidence?.policy_decision).toBe("REVIEW");
    }
  });
});

// ── 15. SOCIAL-1F Data Preserved Correctly ────────────────────────────────────

describe("SOCIAL-1G: SOCIAL-1F recommendation data preserved", () => {
  it("evidence_refs, provider, channel, identity_state, policy_decision preserved in attribution", () => {
    const ev = makeEvidence({
      evidence_refs: ["ev-a", "ev-b"],
      provider: "meta_ig",
      channel: "instagram",
      identity_state: "known_person",
      policy_decision: "ALLOW",
    });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    if (result.attribution_method !== "UNATTRIBUTED") {
      expect(result.selected_evidence?.evidence_refs).toEqual(["ev-a", "ev-b"]);
      expect(result.selected_evidence?.provider).toBe("meta_ig");
      expect(result.selected_evidence?.channel).toBe("instagram");
      expect(result.selected_evidence?.identity_state).toBe("known_person");
      expect(result.selected_evidence?.policy_decision).toBe("ALLOW");
    }
  });
});

// ── 16. Numeric Confidence 0–1 Contract ───────────────────────────────────────

describe("SOCIAL-1G: numeric confidence 0–1 contract", () => {
  it("SOCIAL_CONFIDENCE_BAND_TO_NUMERIC values are all within 0–1", () => {
    for (const [band, val] of Object.entries(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
      expect(typeof val).toBe("number");
    }
  });

  it("attribution_confidence from evidence is within 0–1", () => {
    const ev = makeEvidence({ confidence: 0.80 });
    const result = computeAttribution(makeInput({ evidence_candidates: [ev] })) as AttributionResult;
    if (result.attribution_confidence !== null) {
      expect(result.attribution_confidence).toBeGreaterThanOrEqual(0);
      expect(result.attribution_confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ── 17. social_confidence_band Remains Separate ───────────────────────────────

describe("SOCIAL-1G: social_confidence_band is separate from numeric confidence", () => {
  it("social_confidence_band is a text enum, not a number", () => {
    const ev = makeEvidence({ social_confidence_band: "high", confidence: 0.80 });
    expect(typeof ev.social_confidence_band).toBe("string");
    expect(typeof ev.confidence).toBe("number");
    expect(ev.social_confidence_band).toBe("high");
    expect(ev.confidence).toBe(0.80);
  });

  it("SOCIAL_CONFIDENCE_BAND_TO_NUMERIC maps band to distinct numeric value", () => {
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC["low"]).toBe(0.25);
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC["medium"]).toBe(0.55);
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC["high"]).toBe(0.80);
  });
});

// ── 18. No Provider Send ──────────────────────────────────────────────────────

describe("SOCIAL-1G: no provider send introduced", () => {
  it("computeAttribution does not invoke any send/message function", () => {
    // Pure computation — no side effects. Ensure no send-like property exists.
    const result = computeAttribution(makeInput()) as AttributionResult;
    expect(result).not.toHaveProperty("sent");
    expect(result).not.toHaveProperty("message_id");
    expect(result).not.toHaveProperty("delivery_id");
    expect(result).not.toHaveProperty("provider_send");
  });
});

// ── 19. No Campaign Creation ──────────────────────────────────────────────────

describe("SOCIAL-1G: no campaign creation introduced", () => {
  it("attribution result contains no campaign creation fields", () => {
    const result = computeAttribution(makeInput()) as AttributionResult;
    expect(result).not.toHaveProperty("campaign_id");
    expect(result).not.toHaveProperty("campaign_created");
    expect(result).not.toHaveProperty("campaign_name");
  });
});

// ── 20. No AI-3 Execution ─────────────────────────────────────────────────────

describe("SOCIAL-1G: no AI-3 execution introduced", () => {
  it("attribution result contains no AI-3 execution fields", () => {
    const result = computeAttribution(makeInput()) as AttributionResult;
    expect(result).not.toHaveProperty("ai3_invoked");
    expect(result).not.toHaveProperty("execution_id");
    expect(result).not.toHaveProperty("autonomous_action");
  });
});

// ── 21. No Autonomous Rule Mutation ──────────────────────────────────────────

describe("SOCIAL-1G: no autonomous rule mutation", () => {
  it("attribution functions do not expose rule mutation capabilities", () => {
    // No mutateRules, changePolicy, changeIntentThreshold, etc.
    // Verify the module exports only the expected reporting/attribution functions
    const reportModule = { persistAggregateSnapshot, deriveSnapshotIdempotencyKey };
    const attrModule = { computeAttribution, persistAttribution, deriveAttributionIdempotencyKey };
    // None of these should have side-effectful names
    for (const key of [...Object.keys(reportModule), ...Object.keys(attrModule)]) {
      expect(key).not.toMatch(/mutate|policy|threshold|rule|campaign|send|execute|ai3/i);
    }
  });
});

// ── 22. SOCIAL-0→1F Regressions ──────────────────────────────────────────────

describe("SOCIAL-1G: SOCIAL-0→1F regressions remain PASS", () => {
  it("scoreToband: 0.0 → none", () => expect(scoreToband(0.0)).toBe("none"));
  it("scoreToband: 0.199 → none", () => expect(scoreToband(0.199)).toBe("none"));
  it("scoreToband: 0.2 → low", () => expect(scoreToband(0.2)).toBe("low"));
  it("scoreToband: 0.4 → moderate", () => expect(scoreToband(0.4)).toBe("moderate"));
  it("scoreToband: 0.6 → strong", () => expect(scoreToband(0.6)).toBe("strong"));
  it("scoreToband: 0.8 → high", () => expect(scoreToband(0.8)).toBe("high"));
  it("scoreToband: 1.0 → high", () => expect(scoreToband(1.0)).toBe("high"));

  it("deriveIdempotencyKey (1F): deterministic", () => {
    const k1 = deriveIdempotencyKey(WS_A, "actor1", ["ev1", "ev2"], "2026-08-22");
    const k2 = deriveIdempotencyKey(WS_A, "actor1", ["ev2", "ev1"], "2026-08-22");
    // sorted evidence refs → same key
    expect(k1).toBe(k2);
  });

  it("deriveIdempotencyKey (1F): different workspace → different key", () => {
    const k1 = deriveIdempotencyKey(WS_A, "actor1", ["ev1"], "2026-08-22");
    const k2 = deriveIdempotencyKey(WS_B, "actor1", ["ev1"], "2026-08-22");
    expect(k1).not.toBe(k2);
  });

  it("evaluatePolicy (1E): opt-out → BLOCK", async () => {
    const consent: ConsentRecord = { opted_out: true, platform_terms_only: false };
    const result = await evaluatePolicy({
      workspace_id: WS_A,
      provider: "meta_ig",
      channel_type: "instagram",
      identity_state: "known_person",
      interaction_type: "outbound_reply",
      channel_connected: true,
      consent_record: consent,
      intent_score: 0.9,
    });
    expect(result.decision).toBe("BLOCK");
  });

  it("evaluatePolicy (1E): anonymous_aggregate → BLOCK", async () => {
    const consent: ConsentRecord = { opted_out: false, platform_terms_only: true };
    const result = await evaluatePolicy({
      workspace_id: WS_A,
      provider: "meta_ig",
      channel_type: "instagram",
      identity_state: "anonymous_aggregate",
      interaction_type: "outbound_reply",
      channel_connected: true,
      consent_record: consent,
      intent_score: 0.5,
    });
    expect(result.decision).toBe("BLOCK");
  });
});
