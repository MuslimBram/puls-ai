/**
 * SOCIAL-1D — Evidence-Based Social Intent Score + Journey Integration
 *
 * Scaffold: typed contract tests (contract correctness, no DB required).
 * Full behaviour tests follow in subsequent commits.
 */

import { describe, it, expect } from "vitest";

import * as intentScoreModule from "../../../supabase/functions/_shared/social-intent-score";

const {
  scoreToband,
} = intentScoreModule;

import type {
  IntentScoreBand,
  SocialIntentScore,
  ScoreComputeInput,
  IntentJourneyUpdateResult,
  IntentScoreProcessResult,
} from "../../../supabase/functions/_shared/social-intent-score";

// ── Contract: score band boundaries ──────────────────────────────────────────

describe("SOCIAL-1D scoreToband()", () => {
  const cases: Array<[number, IntentScoreBand]> = [
    [0.0000, "none"],
    [0.1999, "none"],
    [0.2000, "low"],
    [0.3999, "low"],
    [0.4000, "moderate"],
    [0.5999, "moderate"],
    [0.6000, "strong"],
    [0.7999, "strong"],
    [0.8000, "high"],
    [1.0000, "high"],
  ];

  it.each(cases)("score %s → band '%s'", (score, expected) => {
    expect(scoreToband(score)).toBe(expected);
  });

  it("does not accept negative scores into a positive band", () => {
    expect(scoreToband(-0.1)).toBe("none");
  });
});

// ── Contract: SocialIntentScore shape ────────────────────────────────────────

describe("SOCIAL-1D SocialIntentScore shape", () => {
  it("accepts a valid minimal known_person score record", () => {
    const score: SocialIntentScore = {
      id:                     "score-1",
      workspace_id:           "ws-1",
      resolved_identity_key:  "person:person-1",
      canonical_person_id:    "person-1",
      identity_state:         "known_person",
      score:                  0.6500,
      score_band:             "strong",
      evidence_contributions: [],
      evidence_count:         3,
      confidence:             "medium",
      scoring_rule_version:   "1.0.0",
      first_observed_at:      "2026-08-22T10:00:00Z",
      last_calculated_at:     "2026-08-22T12:00:00Z",
    };
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1);
    expect(scoreToband(score.score)).toBe(score.score_band);
  });

  it("platform_actor score has no canonical_person_id", () => {
    const score: SocialIntentScore = {
      id:                     "score-2",
      workspace_id:           "ws-1",
      resolved_identity_key:  "actor:instagram:account1:actor99",
      identity_state:         "platform_actor",
      score:                  0.3000,
      score_band:             "low",
      evidence_contributions: [],
      evidence_count:         1,
      confidence:             "low",
      scoring_rule_version:   "1.0.0",
      first_observed_at:      "2026-08-22T10:00:00Z",
      last_calculated_at:     "2026-08-22T10:00:00Z",
    };
    expect(score.canonical_person_id).toBeUndefined();
    expect(score.identity_state).toBe("platform_actor");
  });
});

// ── Contract: ScoreComputeInput shape ────────────────────────────────────────

describe("SOCIAL-1D ScoreComputeInput shape", () => {
  it("accepts a valid compute input", () => {
    const input: ScoreComputeInput = {
      workspace_id:          "ws-1",
      resolved_identity_key: "person:person-1",
      canonical_person_id:   "person-1",
      identity_state:        "known_person",
      interest_memory_rows: [
        {
          interest_type:  "product",
          interest_ref:   "premium-plan",
          evidence_count: 3,
          strength:       0.75,
          first_seen_at:  "2026-08-20T10:00:00Z",
          last_seen_at:   "2026-08-22T10:00:00Z",
          state:          "active",
        },
      ],
      engagement_events: [
        {
          id:              "evt-1",
          event_type:      "message_received",
          content_ref:     "How much does the premium plan cost?",
          event_timestamp: "2026-08-22T10:00:00Z",
          source_ref:      "ig:post:123",
        },
      ],
      as_of: "2026-08-22T12:00:00Z",
    };
    expect(input.workspace_id).toBe("ws-1");
    expect(input.interest_memory_rows).toHaveLength(1);
    expect(input.engagement_events).toHaveLength(1);
  });
});

// ── Contract: IntentJourneyUpdateResult status values ────────────────────────

describe("SOCIAL-1D IntentJourneyUpdateResult", () => {
  it("blocked_anonymous is a valid status", () => {
    const r: IntentJourneyUpdateResult = { status: "blocked_anonymous" };
    expect(r.status).toBe("blocked_anonymous");
  });

  it("blocked_non_person is a valid status", () => {
    const r: IntentJourneyUpdateResult = { status: "blocked_non_person" };
    expect(r.status).toBe("blocked_non_person");
  });

  it("journey_updated carries phase info", () => {
    const r: IntentJourneyUpdateResult = {
      status:             "journey_updated",
      previous_phase:     "exploring",
      new_phase:          "considering",
      transition_trigger: "pricing_inquiry",
    };
    expect(r.new_phase).toBe("considering");
  });

  it("duplicate_transition is a valid blocking status", () => {
    const r: IntentJourneyUpdateResult = { status: "duplicate_transition" };
    expect(r.status).toBe("duplicate_transition");
  });
});

// ── Contract: IntentScoreProcessResult ───────────────────────────────────────

describe("SOCIAL-1D IntentScoreProcessResult", () => {
  it("skipped_anonymous produces no score", () => {
    const r: IntentScoreProcessResult = {
      status:            "skipped_anonymous",
      evidence_inserted: 0,
    };
    expect(r.score).toBeUndefined();
    expect(r.evidence_inserted).toBe(0);
  });

  it("SOCIAL-1E is NOT present in this module", () => {
    // Ensure no SOCIAL-1E symbols are exported from the intent score module
    // This is a scope-guard assertion
    const keys = Object.keys(intentScoreModule);
    const social1eKeys = keys.filter((k) => k.toLowerCase().includes("1e") || k.toLowerCase().includes("social_1e"));
    expect(social1eKeys).toHaveLength(0);
  });
});
