import { describe, expect, it, vi } from "vitest";
import {
  buildJourneyObservationKey,
  computeTargetJourneyPhase,
  isJourneyTransitionAllowed,
  observeJourneyFromIntentScore,
} from "../../../supabase/functions/_shared/social-intent-journey";
import type { IntentJourneyUpdateRequest, SocialIntentScore } from "../../../supabase/functions/_shared/social-intent-score";

const now = "2026-08-22T12:00:00Z";
const score = (overrides: Partial<SocialIntentScore> = {}): SocialIntentScore => ({
  id: "s1", workspace_id: "ws-1", resolved_identity_key: "person:cp-1",
  canonical_person_id: "cp-1", identity_state: "known_person",
  score: 0.75, score_band: "strong", evidence_count: 3, confidence: "medium",
  scoring_rule_version: "1.0.0", first_observed_at: now, last_calculated_at: now,
  evidence_contributions: [
    { evidence_type: "pricing_inquiry", direction: "positive", weight: 0.22, contribution: 0.22, source_ref: "a", evidence_timestamp: now },
    { evidence_type: "demo_booking_request", direction: "positive", weight: 0.35, contribution: 0.35, source_ref: "b", evidence_timestamp: now },
    { evidence_type: "repeated_interest_signal", direction: "positive", weight: 0.12, contribution: 0.12, source_ref: "c", evidence_timestamp: now },
  ],
  ...overrides,
});
const request = (s = score()): IntentJourneyUpdateRequest => ({
  workspace_id: "ws-1", resolved_identity_key: "person:cp-1", canonical_person_id: "cp-1",
  business_id: "biz-1", customer_id: "cust-1", intent_score: s,
});

describe("SOCIAL-1D Journey policy", () => {
  it("allows only adjacent pre-purchase movement", () => {
    expect(isJourneyTransitionAllowed("first_touch", "exploring", { score: 0.9, evidence_count: 5 })).toBe(true);
    expect(isJourneyTransitionAllowed("first_touch", "considering", { score: 0.9, evidence_count: 5 })).toBe(false);
  });
  it("weak evidence cannot jump", () => {
    expect(computeTargetJourneyPhase("first_touch", { score: 0.9, evidence_count: 1 })).toBeNull();
    expect(computeTargetJourneyPhase("considering", { score: 0.69, evidence_count: 9 })).toBeNull();
  });
  it("strong evidence advances considering → converting", () => {
    expect(computeTargetJourneyPhase("considering", { score: 0.8, evidence_count: 3 })).toBe("converting");
  });
  it("intent does not advance post-purchase phases", () => {
    for (const phase of ["converting", "onboarding", "active", "at_risk", "dormant", "champion"] as const) {
      expect(computeTargetJourneyPhase(phase, { score: 1, evidence_count: 99 })).toBeNull();
    }
  });
});

describe("SOCIAL-1D Journey observation", () => {
  it("observation key is deterministic", () => {
    expect(buildJourneyObservationKey(request())).toBe(buildJourneyObservationKey(request()));
  });
  it("different evidence changes observation key", () => {
    const changed = score({ evidence_contributions: [
      ...score().evidence_contributions,
      { evidence_type: "purchase_related_language", direction: "positive", weight: 0.45, contribution: 0.45, source_ref: "d", evidence_timestamp: now },
    ] });
    expect(buildJourneyObservationKey(request())).not.toBe(buildJourneyObservationKey(request(changed)));
  });
  it("non-person identity is blocked before DB", async () => {
    const rpc = vi.fn();
    const result = await observeJourneyFromIntentScore(request(score({
      identity_state: "platform_actor", canonical_person_id: undefined,
    })), { rpc });
    expect(result.status).toBe("blocked_non_person");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("canonical-person mismatch is blocked", async () => {
    const rpc = vi.fn();
    const req = request(); req.canonical_person_id = "forged";
    expect((await observeJourneyFromIntentScore(req, { rpc })).status).toBe("blocked_non_person");
  });
  it("delegates mutation to one atomic RPC", async () => {
    const rpc = vi.fn(async () => ({ data: {
      status: "journey_updated", previous_phase: "considering", new_phase: "converting",
      transition_trigger: "SOCIAL-1D:abc",
    }, error: null }));
    const result = await observeJourneyFromIntentScore(request(), { rpc });
    expect(result.status).toBe("journey_updated");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("observe_social_intent_journey");
  });
  it("DB unverified-customer result fails closed as non-person", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "blocked_unverified_customer" }, error: null }));
    expect((await observeJourneyFromIntentScore(request(), { rpc })).status).toBe("blocked_non_person");
  });
  it("duplicate transition is surfaced", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "duplicate_transition" }, error: null }));
    expect((await observeJourneyFromIntentScore(request(), { rpc })).status).toBe("duplicate_transition");
  });
  it("RPC failure returns error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "down" } }));
    expect((await observeJourneyFromIntentScore(request(), { rpc })).status).toBe("error");
  });
});
