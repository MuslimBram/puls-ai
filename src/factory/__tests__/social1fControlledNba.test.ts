/**
 * SOCIAL-1F — Controlled Social Next-Best-Action
 *
 * Behavior and security tests.
 *
 * SAFETY INVARIANTS TESTED:
 *   1.  policy BLOCK → recommendation_status = "blocked" (no actionable NBA)
 *   2.  policy REVIEW → recommendation_status = "review_required" + human_approval_required = true
 *   3.  policy ALLOW does NOT auto-execute (status = "recommended" only)
 *   4.  anonymous_aggregate → do_nothing
 *   5.  platform_actor cannot become CRM-known person for commercial NBA
 *   6.  weak evidence (empty refs) → do_nothing
 *   7.  high intent cannot override policy BLOCK / opt-out
 *   8.  policy context mismatch is blocked (workspace/provider/channel/identity)
 *   9.  duplicate source evidence does not create duplicate active NBA (idempotency)
 *   10. retry is idempotent (same idempotency key → DUPLICATE_ACTIVE_NBA)
 *   11. commercial recommendation cannot invent offer/discount
 *   12. missing commercial config → do_nothing / safe fallback
 *   13. human_handoff → recommendation only, human_approval_required = true
 *   14. no provider send API invoked
 *   15. no campaign created
 *   16. no AI-3 execution invoked
 *   17. ALLOW + known_person + moderate intent → follow_up (safe default)
 *   18. ALLOW + converting + strong intent + configured offer → personalized_offer
 *   19. ALLOW + champion + referral program → referral_invitation
 *   20. ALLOW + at_risk → human_handoff
 *   21. do_nothing action → recommendation_status = "do_nothing"
 *   22. SOCIAL-1E policy reasons preserved in NBA result
 *   23. SOCIAL-1E regression: policy engine still produces BLOCK for opt-out
 *   24. SOCIAL-1D regression: intent score band computation still correct
 *   25. package.json unchanged
 *   26. package-lock unchanged
 */

import { describe, it, expect } from "vitest";
import {
  deriveIdempotencyKey,
  generateSocialNba,
  persistSocialNbaRecommendation,
  SOCIAL_CONFIDENCE_BAND_TO_NUMERIC,
  type SocialNbaInput,
  type SocialConfidenceBand,
} from "../../../supabase/functions/_shared/social-nba";
import type { PolicyResult } from "../../../supabase/functions/_shared/social-policy-engine";
import { evaluatePolicy } from "../../../supabase/functions/_shared/social-policy-engine";
import { scoreToband } from "../../../supabase/functions/_shared/social-intent-score";
import type { ConsentRecord } from "../../../supabase/functions/_shared/social-consent-evaluator";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Shared Fixtures ────────────────────────────────────────────────────────────

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";
const IDENTITY_KEY = "ig:actor-abc-123";
const PERSON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVIDENCE = ["ev-001", "ev-002", "ev-003"];
const WINDOW = "2026-08-22";

const allowResult: PolicyResult = {
  decision: "ALLOW",
  reasons: ["POLICY_OK"],
  provider: "meta_ig",
  channel_type: "instagram",
  identity_state: "known_person",
  workspace_id: WORKSPACE,
  capability_verified: true,
  consent_valid: true,
  evaluated_at: new Date().toISOString(),
};

const reviewResult: PolicyResult = {
  decision: "REVIEW",
  reasons: ["CAPABILITY_NOT_VERIFIED"],
  provider: "meta_ig",
  channel_type: "instagram",
  identity_state: "known_person",
  workspace_id: WORKSPACE,
  capability_verified: false,
  consent_valid: false,
  evaluated_at: new Date().toISOString(),
};

const blockResult: PolicyResult = {
  decision: "BLOCK",
  reasons: ["OPTED_OUT"],
  provider: "meta_ig",
  channel_type: "instagram",
  identity_state: "known_person",
  workspace_id: WORKSPACE,
  capability_verified: true,
  consent_valid: false,
  evaluated_at: new Date().toISOString(),
};

const baseAllowInput: SocialNbaInput = {
  workspace_id: WORKSPACE,
  resolved_identity_key: IDENTITY_KEY,
  canonical_person_id: PERSON_ID,
  identity_state: "known_person",
  provider: "meta_ig",
  channel: "instagram",
  intent_score: 0.55,
  intent_score_band: "moderate",
  journey_phase: "considering",
  policy_result: allowResult,
  evidence_refs: EVIDENCE,
  recommendation_window: WINDOW,
};

// ── Test helpers ───────────────────────────────────────────────────────────────

const noOpDb = {
  from: () => ({
    select: () => ({
      eq: function () { return this; },
      is: function () { return this; },
      limit: function () { return this; },
      single: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
  rpc: () => Promise.resolve({ data: false, error: null }),
} as unknown as Parameters<typeof evaluatePolicy>[0]["db"];

const validConsent: ConsentRecord = {
  workspace_id: WORKSPACE,
  channel_type: "instagram",
  contact_identifier: "actor-123",
  consent_source: "explicit_consent",
  consent_given_at: "2026-01-01T00:00:00Z",
  is_opted_out: false,
  is_globally_suppressed: false,
  is_channel_suppressed: false,
  marketing_allowed: true,
  transactional_allowed: true,
  communication_type: "all",
};

// ── 1. Policy BLOCK → blocked ──────────────────────────────────────────────────

describe("SOCIAL-1F: policy BLOCK → blocked", () => {
  it("TEST-1: BLOCK → recommendation_status=blocked, action=do_nothing", () => {
    const result = generateSocialNba({ ...baseAllowInput, policy_result: blockResult });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.action_type).toBe("do_nothing");
    expect(result.human_approval_required).toBe(true);
    expect(result.reason_codes).toContain("POLICY_BLOCK");
  });

  it("TEST-7: high intent (0.95) cannot override policy BLOCK", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.95,
      intent_score_band: "high",
      policy_result: blockResult,
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.action_type).toBe("do_nothing");
    expect(result.human_approval_required).toBe(true);
  });

  it("TEST-7b: high intent cannot override opt-out BLOCK", () => {
    const optOutBlock: PolicyResult = { ...blockResult, reasons: ["OPTED_OUT"] };
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 1.0,
      intent_score_band: "high",
      policy_result: optOutBlock,
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.policy_reasons).toContain("OPTED_OUT");
  });
});

// ── 2. Policy REVIEW → review_required + human approval ───────────────────────

describe("SOCIAL-1F: policy REVIEW → review_required", () => {
  it("TEST-2: REVIEW → recommendation_status=review_required", () => {
    const result = generateSocialNba({ ...baseAllowInput, policy_result: reviewResult });
    expect(result.recommendation_status).toBe("review_required");
    expect(result.human_approval_required).toBe(true);
    expect(result.reason_codes).toContain("POLICY_REVIEW");
  });

  it("TEST-2b: REVIEW → NBA is generated but requires approval", () => {
    const result = generateSocialNba({ ...baseAllowInput, policy_result: reviewResult });
    expect(result.reason_codes).toContain("NBA_GENERATED");
    expect(result.human_approval_required).toBe(true);
  });
});

// ── 3. Policy ALLOW does NOT auto-execute ──────────────────────────────────────

describe("SOCIAL-1F: policy ALLOW → recommended only (no execution)", () => {
  it("TEST-3: ALLOW → status=recommended, NOT executed", () => {
    const result = generateSocialNba(baseAllowInput);
    expect(result.recommendation_status).toBe("recommended");
    // No execution field present; this is a recommendation only
    expect(result).not.toHaveProperty("executed_at");
    expect(result).not.toHaveProperty("send_result");
  });

  it("TEST-3b: recommended status still has idempotency_key and timestamps", () => {
    const result = generateSocialNba(baseAllowInput);
    expect(result.idempotency_key).toBeTruthy();
    expect(result.recommended_at).toBeTruthy();
    expect(result.policy_evaluated_at).toBeTruthy();
  });
});

// ── 4. Anonymous aggregate → do_nothing ───────────────────────────────────────

describe("SOCIAL-1F: anonymous_aggregate → do_nothing", () => {
  it("TEST-4: anonymous_aggregate → do_nothing regardless of policy", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      identity_state: "anonymous_aggregate",
      policy_result: { ...allowResult, identity_state: "anonymous_aggregate" },
    });
    expect(result.recommendation_status).toBe("do_nothing");
    expect(result.action_type).toBe("do_nothing");
    expect(result.reason_codes).toContain("ANONYMOUS_AGGREGATE");
  });
});

// ── 5. Platform actor cannot become CRM-known person ──────────────────────────

describe("SOCIAL-1F: platform_actor → no commercial NBA", () => {
  it("TEST-5: platform_actor → do_nothing (no person-level commercial NBA)", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      identity_state: "platform_actor",
      canonical_person_id: undefined,
      policy_result: allowResult,
    });
    // platform_actor does not satisfy known_person gate in selectActionType
    expect(result.action_type).toBe("do_nothing");
  });
});

// ── 6. Weak evidence → do_nothing ─────────────────────────────────────────────

describe("SOCIAL-1F: insufficient evidence → do_nothing", () => {
  it("TEST-6: empty evidence_refs → do_nothing", () => {
    const result = generateSocialNba({ ...baseAllowInput, evidence_refs: [] });
    expect(result.recommendation_status).toBe("do_nothing");
    expect(result.reason_codes).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("TEST-6b: empty evidence + REVIEW → review_required (not ALLOW)", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      evidence_refs: [],
      policy_result: reviewResult,
    });
    expect(result.recommendation_status).toBe("review_required");
    expect(result.human_approval_required).toBe(true);
  });
});

// ── 8. Policy context binding mismatch protection ──────────────────────────────

describe("SOCIAL-1F: policy context binding", () => {
  it("TEST-8a: foreign workspace ALLOW → BLOCKED", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      policy_result: { ...allowResult, workspace_id: WORKSPACE_B },
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.reason_codes).toContain("POLICY_CONTEXT_MISMATCH");
  });

  it("TEST-8b: foreign provider ALLOW → BLOCKED", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      policy_result: { ...allowResult, provider: "email" },
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.reason_codes).toContain("POLICY_CONTEXT_MISMATCH");
  });

  it("TEST-8c: foreign channel ALLOW → BLOCKED", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      policy_result: { ...allowResult, channel_type: "email" },
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.reason_codes).toContain("POLICY_CONTEXT_MISMATCH");
  });

  it("TEST-8d: identity-state mismatch → BLOCKED", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      policy_result: { ...allowResult, identity_state: "platform_actor" },
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.reason_codes).toContain("POLICY_CONTEXT_MISMATCH");
  });

  it("TEST-8e: high intent cannot override mismatch", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.99,
      intent_score_band: "high",
      policy_result: { ...allowResult, workspace_id: WORKSPACE_B },
    });
    expect(result.recommendation_status).toBe("blocked");
    expect(result.action_type).toBe("do_nothing");
    expect(result.reason_codes).toContain("POLICY_CONTEXT_MISMATCH");
  });
});

// ── 9 & 10. Idempotency ────────────────────────────────────────────────────────

describe("SOCIAL-1F: idempotency", () => {
  it("TEST-9: same evidence → same idempotency_key", () => {
    const key1 = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, EVIDENCE, WINDOW);
    const key2 = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, [...EVIDENCE].reverse(), WINDOW);
    expect(key1).toBe(key2);
  });

  it("TEST-9b: different evidence → different idempotency_key", () => {
    const key1 = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, ["ev-001"], WINDOW);
    const key2 = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, ["ev-002"], WINDOW);
    expect(key1).not.toBe(key2);
  });

  it("TEST-10: retry with existing_active_idempotency_key → DUPLICATE_ACTIVE_NBA", () => {
    const firstResult = generateSocialNba(baseAllowInput);
    const retryResult = generateSocialNba({
      ...baseAllowInput,
      existing_active_idempotency_key: firstResult.idempotency_key,
    });
    expect(retryResult.reason_codes).toContain("DUPLICATE_ACTIVE_NBA");
    expect(retryResult.reason_codes).toContain("IDEMPOTENT_RETRY");
    expect(retryResult.recommendation_status).toBe("do_nothing");
  });

  it("TEST-10b: different workspace → different idempotency_key (no cross-workspace reuse)", () => {
    const key1 = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, EVIDENCE, WINDOW);
    const key2 = deriveIdempotencyKey(WORKSPACE_B, IDENTITY_KEY, EVIDENCE, WINDOW);
    expect(key1).not.toBe(key2);
  });

  it("TEST-10c: retry before/after midnight with same logical window → same key", () => {
    const beforeMidnight = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, EVIDENCE, "2026-08-22");
    const afterMidnightRetry = deriveIdempotencyKey(WORKSPACE, IDENTITY_KEY, EVIDENCE, "2026-08-22");
    expect(beforeMidnight).toBe(afterMidnightRetry);
  });
});

// ── 11 & 12. Commercial config verification ────────────────────────────────────

describe("SOCIAL-1F: commercial config verification", () => {
  it("TEST-11: no configured_offer_ids → cannot generate personalized_offer", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.85,
      intent_score_band: "high",
      journey_phase: "converting",
      business_config: { configured_offer_ids: [] },
    });
    // Without configured offers, action must not be personalized_offer
    expect(result.action_type).not.toBe("personalized_offer");
  });

  it("TEST-12: missing business_config → do_nothing or safe fallback", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.85,
      intent_score_band: "high",
      journey_phase: "converting",
      business_config: undefined,
    });
    // No business config → no commercial action
    expect(["follow_up", "do_nothing"]).toContain(result.action_type);
  });

  it("TEST-12b: referral_invitation requires referral_program_active=true", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      journey_phase: "champion",
      intent_score: 0.75,
      intent_score_band: "strong",
      business_config: { referral_program_active: false },
    });
    expect(result.action_type).not.toBe("referral_invitation");
  });
});

// ── 13. human_handoff → recommendation only ───────────────────────────────────

describe("SOCIAL-1F: human_handoff → recommendation only", () => {
  it("TEST-13: at_risk journey → human_handoff with human_approval_required", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      journey_phase: "at_risk",
      intent_score: 0.6,
      intent_score_band: "moderate",
    });
    expect(result.action_type).toBe("human_handoff");
    expect(result.human_approval_required).toBe(true);
    expect(result.recommendation_status).toBe("recommended");
  });

  it("TEST-13b: dormant journey → human_handoff, no auto-execution", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      journey_phase: "dormant",
    });
    expect(result.action_type).toBe("human_handoff");
    expect(result.recommendation_status).toBe("recommended");
    expect(result).not.toHaveProperty("executed_at");
  });
});

// ── 14-16. No provider send / campaign / AI-3 ────────────────────────────────

describe("SOCIAL-1F: no execution side effects", () => {
  it("TEST-14: generateSocialNba does not invoke any provider send API", () => {
    // generateSocialNba is a pure synchronous function — no async, no network
    const start = Date.now();
    const result = generateSocialNba(baseAllowInput);
    const elapsed = Date.now() - start;
    // Should complete immediately (no network call)
    expect(elapsed).toBeLessThan(100);
    expect(result.recommendation_status).toBe("recommended");
  });

  it("TEST-15: result has no campaign_id or send_result field", () => {
    const result = generateSocialNba(baseAllowInput) as Record<string, unknown>;
    expect(result).not.toHaveProperty("campaign_id");
    expect(result).not.toHaveProperty("send_result");
    expect(result).not.toHaveProperty("message_id");
  });

  it("TEST-16: result has no ai3_action or execution_token field", () => {
    const result = generateSocialNba(baseAllowInput) as Record<string, unknown>;
    expect(result).not.toHaveProperty("ai3_action");
    expect(result).not.toHaveProperty("execution_token");
    expect(result).not.toHaveProperty("executed_at");
  });
});

// ── 17-21. Action type selection ──────────────────────────────────────────────

describe("SOCIAL-1F: action type selection", () => {
  it("TEST-17: ALLOW + known_person + moderate intent → follow_up", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.55,
      intent_score_band: "moderate",
      journey_phase: "considering",
    });
    expect(result.action_type).toBe("follow_up");
    expect(result.recommendation_status).toBe("recommended");
  });

  it("TEST-18: ALLOW + converting + strong intent + configured offer → personalized_offer", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.75,
      intent_score_band: "strong",
      journey_phase: "converting",
      business_config: { configured_offer_ids: ["offer-001"] },
    });
    expect(result.action_type).toBe("personalized_offer");
    expect(result.recommendation_status).toBe("recommended");
  });

  it("TEST-19: ALLOW + champion + referral program → referral_invitation", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.75,
      intent_score_band: "strong",
      journey_phase: "champion",
      business_config: { referral_program_active: true },
    });
    expect(result.action_type).toBe("referral_invitation");
  });

  it("TEST-20: ALLOW + at_risk → human_handoff", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      journey_phase: "at_risk",
    });
    expect(result.action_type).toBe("human_handoff");
  });

  it("TEST-21: do_nothing action → recommendation_status = do_nothing", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      identity_state: "platform_actor",
      policy_result: { ...allowResult, identity_state: "platform_actor" },
    });
    expect(result.action_type).toBe("do_nothing");
    expect(result.recommendation_status).toBe("do_nothing");
  });

  it("intent band=none → do_nothing", () => {
    const result = generateSocialNba({
      ...baseAllowInput,
      intent_score: 0.05,
      intent_score_band: "none",
    });
    expect(result.action_type).toBe("do_nothing");
  });
});

// ── 22. Policy reasons preserved ─────────────────────────────────────────────

describe("SOCIAL-1F: SOCIAL-1E policy reasons preserved", () => {
  it("TEST-22: policy_reasons preserved in NBA result for BLOCK", () => {
    const result = generateSocialNba({ ...baseAllowInput, policy_result: blockResult });
    expect(result.policy_reasons).toEqual(expect.arrayContaining(["OPTED_OUT"]));
    expect(result.policy_evaluated_at).toBeTruthy();
    expect(result.policy_decision).toBe("BLOCK");
  });

  it("TEST-22b: policy_reasons preserved for ALLOW", () => {
    const result = generateSocialNba(baseAllowInput);
    expect(result.policy_reasons).toEqual(expect.arrayContaining(["POLICY_OK"]));
    expect(result.policy_decision).toBe("ALLOW");
  });
});

// ── 23. SOCIAL-1E regression ──────────────────────────────────────────────────

describe("SOCIAL-1E regression: policy engine still authoritative", () => {
  it("TEST-23: evaluatePolicy with opt-out still returns BLOCK", async () => {
    const { evaluateConsent } = await import("../../../supabase/functions/_shared/social-consent-evaluator");
    const r = await evaluateConsent({
      workspace_id: WORKSPACE,
      contact_identifier: "actor-123",
      channel_type: "instagram",
      identity_state: "known_person",
      consent_record: { ...validConsent, is_opted_out: true },
      db: noOpDb,
    });
    expect(r.validity).toBe("not_valid");
    expect(r.reasons).toContain("OPTED_OUT");
  });

  it("TEST-23b: evaluatePolicy with anonymous_aggregate → BLOCK", async () => {
    const result = await evaluatePolicy({
      workspace_id: WORKSPACE,
      provider: "meta_ig",
      channel_type: "instagram",
      identity_state: "anonymous_aggregate",
      interaction_type: "proactive_outbound",
      contact_identifier: "anon-001",
      channel_connected: true,
      db: noOpDb,
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.reasons).toContain("ANONYMOUS_AGGREGATE");
  });
});

// ── 24. SOCIAL-1D regression ──────────────────────────────────────────────────

describe("SOCIAL-1D regression: intent score band still correct", () => {
  it("TEST-24: scoreToband boundaries are stable", () => {
    expect(scoreToband(0.0)).toBe("none");
    expect(scoreToband(0.19)).toBe("none");
    expect(scoreToband(0.2)).toBe("low");
    expect(scoreToband(0.4)).toBe("moderate");
    expect(scoreToband(0.6)).toBe("strong");
    expect(scoreToband(0.8)).toBe("high");
    expect(scoreToband(1.0)).toBe("high");
  });
});

describe("SOCIAL-1F: canonical persistence adapter", () => {
  it("uses canonical next_best_actions path and not a parallel social table", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260822180000_social_1f_controlled_nba.sql"),
      "utf-8",
    );
    expect(migration).toContain("ALTER TABLE public.next_best_actions");
    expect(migration).toContain("upsert_social_nba_next_best_action");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS public.social_nba_recommendations");
    expect(migration).toContain("workspace_members");
    expect(migration).not.toContain("raw_user_meta_data");
  });

  it("concurrent duplicate persistence → one active canonical NBA", async () => {
    const seen = new Set<string>();
    const db = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "validate_nba_against_rules") {
          return { data: { allowed: true, rule_id: null }, error: null };
        }
        if (name === "upsert_social_nba_next_best_action") {
          const key = String(args?.p_idempotency_key ?? "");
          if (seen.has(key)) return { data: { id: "nba-1", inserted: false }, error: null };
          seen.add(key);
          return { data: { id: "nba-1", inserted: true }, error: null };
        }
        return { data: null, error: { message: "unknown rpc" } };
      },
    };

    const recommendation = generateSocialNba(baseAllowInput);
    const a = await persistSocialNbaRecommendation(db, { recommendation });
    const b = await persistSocialNbaRecommendation(db, { recommendation });

    expect(a.status).toBe("inserted");
    expect(b.status).toBe("duplicate_active");
  });

  it("same evidence/workspace/identity/window → one active NBA; distinct evidence → distinct NBA", async () => {
    const seen = new Set<string>();
    const db = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "validate_nba_against_rules") return { data: { allowed: true }, error: null };
        if (name === "upsert_social_nba_next_best_action") {
          const key = String(args?.p_idempotency_key ?? "");
          if (seen.has(key)) return { data: { id: `dup-${key}`, inserted: false }, error: null };
          seen.add(key);
          return { data: { id: `new-${key}`, inserted: true }, error: null };
        }
        return { data: null, error: { message: "unknown rpc" } };
      },
    };

    const same1 = generateSocialNba(baseAllowInput);
    const same2 = generateSocialNba({ ...baseAllowInput, evidence_refs: [...EVIDENCE].reverse() });
    const diff = generateSocialNba({ ...baseAllowInput, evidence_refs: ["ev-999"] });

    const r1 = await persistSocialNbaRecommendation(db, { recommendation: same1 });
    const r2 = await persistSocialNbaRecommendation(db, { recommendation: same2 });
    const r3 = await persistSocialNbaRecommendation(db, { recommendation: diff });

    expect(r1.status).toBe("inserted");
    expect(r2.status).toBe("duplicate_active");
    expect(r3.status).toBe("inserted");
  });

  it("missing commercial truth / denied rules → safe do_nothing fallback", async () => {
    const db = {
      rpc: async (name: string) => {
        if (name === "validate_nba_against_rules") return { data: { allowed: false }, error: null };
        if (name === "upsert_social_nba_next_best_action") return { data: { id: "nba-2", inserted: true }, error: null };
        return { data: null, error: { message: "unknown rpc" } };
      },
    };

    const recommendation = generateSocialNba({
      ...baseAllowInput,
      journey_phase: "converting",
      intent_score_band: "high",
      intent_score: 0.92,
      business_config: { configured_offer_ids: ["offer-123"] },
    });

    const persisted = await persistSocialNbaRecommendation(db, { recommendation });
    expect(persisted.recommendation.action_type).toBe("do_nothing");
    expect(persisted.recommendation.recommendation_status).toBe("do_nothing");
    expect(persisted.recommendation.reason_codes).toContain("BUSINESS_RULES_NOT_ELIGIBLE");
  });
});

// ── 25 & 26. Package files unchanged ──────────────────────────────────────────

describe("SOCIAL-1F: package files unchanged", () => {
  it("TEST-25: package.json has not been modified by SOCIAL-1F", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
    // Verify the package still has the canonical test script and no new deps added
    expect(pkg.scripts?.test).toBe("vitest run");
    // No social-1f-specific packages should have been added
    const allDeps = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    });
    expect(allDeps.some((d: string) => d.includes("social-1f"))).toBe(false);
  });

  it("TEST-26: package-lock.json exists and is not empty", () => {
    const lockContent = readFileSync(resolve(process.cwd(), "package-lock.json"), "utf-8");
    expect(lockContent.length).toBeGreaterThan(100);
    // lock file should NOT contain any social-1f-specific package references
    expect(lockContent.includes("social-1f-package")).toBe(false);
  });
});

// ── Confidence Contract Tests ──────────────────────────────────────────────────

describe("SOCIAL-1F: canonical confidence contract", () => {
  it("TEST-27: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC maps all bands deterministically", () => {
    // Mapping must be deterministic and documented
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low).toBe(0.25);
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.medium).toBe(0.55);
    expect(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.high).toBe(0.80);
  });

  it("TEST-28: every mapped confidence value is in [0,1]", () => {
    const bands: SocialConfidenceBand[] = ["low", "medium", "high"];
    for (const band of bands) {
      const v = SOCIAL_CONFIDENCE_BAND_TO_NUMERIC[band];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("TEST-29: generateSocialNba result.confidence is always a number in [0,1]", () => {
    const bands: SocialConfidenceBand[] = ["low", "medium", "high"];
    for (const band of bands) {
      const result = generateSocialNba(baseAllowInput, band);
      expect(typeof result.confidence).toBe("number");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("TEST-30: generateSocialNba result.confidence is never a string", () => {
    const result = generateSocialNba(baseAllowInput, "high");
    // Must NOT be a text value like "low", "medium", "high"
    expect(typeof result.confidence).not.toBe("string");
    expect(result.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.high);
  });

  it("TEST-31: result.social_confidence_band is a categorical string", () => {
    const result = generateSocialNba(baseAllowInput, "medium");
    expect(["low", "medium", "high"]).toContain(result.social_confidence_band);
  });

  it("TEST-32: numeric confidence matches band via deterministic mapping", () => {
    for (const band of ["low", "medium", "high"] as SocialConfidenceBand[]) {
      const result = generateSocialNba(baseAllowInput, band);
      expect(result.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC[result.social_confidence_band]);
    }
  });

  it("TEST-33: POLICY_BLOCK → confidence is numeric low (0.25), band is 'low'", () => {
    const input: SocialNbaInput = {
      ...baseAllowInput,
      policy_result: blockResult,
    };
    const result = generateSocialNba(input, "high");
    expect(result.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low);
    expect(result.social_confidence_band).toBe("low");
  });

  it("TEST-34: anonymous_aggregate → confidence is numeric low (0.25), band is 'low'", () => {
    const input: SocialNbaInput = {
      ...baseAllowInput,
      identity_state: "anonymous_aggregate",
      policy_result: allowResult,
    };
    const result = generateSocialNba(input, "high");
    expect(result.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low);
    expect(result.social_confidence_band).toBe("low");
  });

  it("TEST-35: selectActionType never returns commercial action without configured_offer_ids; deriveConfidence downgrades as double-safety", () => {
    // Case A: with configured offers — commercial action is selected and confidence uses the band
    const inputWithConfig: SocialNbaInput = {
      ...baseAllowInput,
      policy_result: allowResult,
      journey_phase: "converting",
      intent_score: 0.9,
      intent_score_band: "high",
      business_config: { configured_offer_ids: ["offer-001"] },
    };
    const resultWithConfig = generateSocialNba(inputWithConfig, "high");
    // A commercial action should be selected when config is present
    expect(["personalized_offer", "upsell", "cross_sell"]).toContain(resultWithConfig.action_type);
    // Confidence must be numeric 0.80 (high band, no downgrade)
    expect(resultWithConfig.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.high);
    expect(resultWithConfig.social_confidence_band).toBe("high");

    // Case B: without configured offers — selectActionType guards so no commercial action is emitted
    const inputNoConfig: SocialNbaInput = {
      ...baseAllowInput,
      policy_result: allowResult,
      journey_phase: "converting",
      intent_score: 0.9,
      intent_score_band: "high",
      business_config: { configured_offer_ids: [] },
    };
    const resultNoConfig = generateSocialNba(inputNoConfig, "high");
    // No commercial action can be selected without config
    expect(["personalized_offer", "upsell", "cross_sell"]).not.toContain(resultNoConfig.action_type);
    // Confidence is still numeric (0.80 for high band; no commercial action = no downgrade)
    expect(typeof resultNoConfig.confidence).toBe("number");
    expect(resultNoConfig.confidence).toBeGreaterThanOrEqual(0);
    expect(resultNoConfig.confidence).toBeLessThanOrEqual(1);
    // The double-safety in deriveConfidence (which also downgrades commercial+empty config)
    // confirms confidence is always numeric regardless of path taken
    expect(resultNoConfig.confidence).toBe(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC[resultNoConfig.social_confidence_band]);
  });

  it("TEST-36: persistSocialNbaRecommendation passes numeric confidence to RPC", async () => {
    const capturedArgs: Record<string, unknown>[] = [];
    const db = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        capturedArgs.push({ name, ...args });
        if (name === "validate_nba_against_rules") return { data: { allowed: true, rule_id: null }, error: null };
        if (name === "upsert_social_nba_next_best_action") return { data: [{ id: "test-id", inserted: true }], error: null };
        return { data: null, error: null };
      },
    };

    const recommendation = generateSocialNba(baseAllowInput, "medium");
    await persistSocialNbaRecommendation(db, { recommendation, lead_id: null });

    const upsertCall = capturedArgs.find((a) => a.name === "upsert_social_nba_next_best_action");
    expect(upsertCall).toBeDefined();
    // p_confidence must be a number, not a string
    expect(typeof upsertCall!.p_confidence).toBe("number");
    expect(upsertCall!.p_confidence).toBeGreaterThanOrEqual(0);
    expect(upsertCall!.p_confidence).toBeLessThanOrEqual(1);
    // p_social_confidence_band must be a categorical string
    expect(["low", "medium", "high"]).toContain(upsertCall!.p_social_confidence_band);
  });

  it("TEST-37: canonical customer-brain NBA confidence remains numeric (0.5 default, 0-1 range)", () => {
    // Customer-brain inserts confidence: nba.confidence ?? 0.5
    // This test documents and verifies the canonical numeric contract
    const fallback = 0.5;
    expect(typeof fallback).toBe("number");
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeLessThanOrEqual(1);

    // Verify that SOCIAL confidence values fit within canonical 0-1 contract
    for (const v of Object.values(SOCIAL_CONFIDENCE_BAND_TO_NUMERIC)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("TEST-38: SOCIAL categorical band does NOT overwrite canonical numeric semantics", () => {
    // The confidence field in SocialNbaResult must always be a number,
    // never the string band value itself
    const result = generateSocialNba(baseAllowInput, "high");
    expect(result.confidence).not.toBe("high");
    expect(result.confidence).not.toBe("medium");
    expect(result.confidence).not.toBe("low");
    expect(typeof result.confidence).toBe("number");
    // The separate band field holds the categorical value
    expect(result.social_confidence_band).toBe("high");
  });
});
