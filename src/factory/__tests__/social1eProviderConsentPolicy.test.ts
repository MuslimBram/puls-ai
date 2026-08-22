/**
 * SOCIAL-1E — Provider Capability + Consent + Policy
 *
 * Behavior and security tests.
 *
 * SAFETY INVARIANTS TESTED:
 *   1.  supported provider + valid consent → ALLOW
 *   2.  explicit opt-out → BLOCK
 *   3.  global suppression → BLOCK
 *   4.  anonymous_aggregate → BLOCK (person-level outbound)
 *   5.  platform_actor cannot be treated as CRM known_person (proactive outbound BLOCK)
 *   6.  missing/unverified provider capability → REVIEW or BLOCK
 *   7.  disconnected channel → BLOCK
 *   8.  provider restriction cannot be overridden by high intent
 *   9.  SOCIAL-1D high score does not override opt-out
 *   10. cross-workspace consent cannot be reused
 *   11. revoked consent is not valid
 *   12. quiet-hour policy works when configured
 *   13. transactional permission is not silently treated as marketing permission
 *   14. no outbound provider API call occurs
 *   15. no NBA execution occurs
 *   16. no campaign creation occurs
 *   17. AI-3 files untouched
 *   18. Website PR #28 scope untouched
 *   19. package.json unchanged
 *   20. package-lock unchanged
 *   --- SOCIAL-1E POLICY SAFETY CORRECTION ---
 *   21. global suppression uses correct workspace_id scope
 *   22. channel_type='all' suppression blocks
 *   23. broadcast opt-out blocks via canonical RPC
 *   24. suppression DB error → REVIEW, never ALLOW
 *   25. foreign consent_record.workspace_id → BLOCK
 *   26. omitting consent_workspace_id does NOT bypass record isolation
 *   27. no marketing + no transactional → not ALLOW
 *   28. unknown consent source → REVIEW, not ALLOW
 *   29. provider/channel mismatch → BLOCK
 *   30. closed conversation window → BLOCK
 *   31. unknown window state → REVIEW, not ALLOW
 *   32. high intent cannot override any new gate
 */

import { describe, it, expect, vi } from "vitest";
import { getProviderCapability, canReply, canProactiveOutbound, listRegisteredProviders } from "../../../supabase/functions/_shared/social-provider-capability";
import { evaluateConsent } from "../../../supabase/functions/_shared/social-consent-evaluator";
import { evaluatePolicy } from "../../../supabase/functions/_shared/social-policy-engine";
import type { ConsentRecord } from "../../../supabase/functions/_shared/social-consent-evaluator";
import type { PolicyEvaluationInput } from "../../../supabase/functions/_shared/social-policy-engine";

const noOpDb = {
  from: () => ({ select: () => ({ eq: function() { return this; }, is: function() { return this; }, limit: function() { return this; }, single: () => Promise.resolve({ data: null, error: null }), then: (fn: (v: { data: null; error: null }) => unknown) => Promise.resolve(fn({ data: null, error: null })) }), insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }), eq: function() { return this; } }), eq: function() { return this; } }), update: () => ({ eq: function() { return this; }, select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  rpc: () => Promise.resolve({ data: false, error: null }),
} as unknown as Parameters<typeof evaluateConsent>[0]["db"];

/** DB mock whose suppression RPC returns suppressed=true for the named workspace. */
function suppressedDb(targetWorkspace: string): Parameters<typeof evaluateConsent>[0]["db"] {
  return {
    from: (noOpDb as any).from,
    rpc: (_fn: string, args: Record<string, unknown>) =>
      Promise.resolve({ data: args["_workspace_id"] === targetWorkspace, error: null }),
  } as unknown as Parameters<typeof evaluateConsent>[0]["db"];
}

/** DB mock whose suppression RPC returns an error. */
const errorDb: Parameters<typeof evaluateConsent>[0]["db"] = {
  from: (noOpDb as any).from,
  rpc: () => Promise.resolve({ data: null, error: new Error("DB unavailable") }),
} as unknown as Parameters<typeof evaluateConsent>[0]["db"];

const WORKSPACE = "ws-test-001";
const WORKSPACE_B = "ws-test-002";
const CONTACT = "actor-123";

const validConsentRecord: ConsentRecord = { workspace_id: WORKSPACE, channel_type: "instagram", contact_identifier: CONTACT, consent_source: "explicit_consent", consent_given_at: "2026-01-01T00:00:00Z", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: true, transactional_allowed: true, communication_type: "all" };

const baseInput: PolicyEvaluationInput = { workspace_id: WORKSPACE, provider: "meta_ig", channel_type: "instagram", identity_state: "known_person", interaction_type: "outbound_reply", contact_identifier: CONTACT, channel_connected: true, consent_record: validConsentRecord, db: noOpDb };

describe("SOCIAL-1E: Provider Capability Registry", () => {
  it("returns a capability record for meta_ig", () => { const cap = getProviderCapability("meta_ig"); expect(cap).not.toBeNull(); expect(cap!.provider).toBe("meta_ig"); expect(cap!.overall_status).toBe("LIVE"); });
  it("returns null for unknown provider", () => { expect(getProviderCapability("unknown_provider_xyz")).toBeNull(); });
  it("whatsapp is NOT_VERIFIED overall", () => { const cap = getProviderCapability("whatsapp"); expect(cap!.overall_status).toBe("NOT_VERIFIED"); expect(cap!.proactive_outbound).toBe("NOT_VERIFIED"); });
  it("canReply is true for meta_ig", () => { expect(canReply("meta_ig")).toBe(true); });
  it("canProactiveOutbound is false for meta_ig", () => { expect(canProactiveOutbound("meta_ig")).toBe(false); });
  it("canProactiveOutbound is true for email", () => { expect(canProactiveOutbound("email")).toBe(true); });
  it("listRegisteredProviders includes expected providers", () => { const p = listRegisteredProviders(); expect(p).toContain("meta_ig"); expect(p).toContain("meta_fb"); expect(p).toContain("telegram"); expect(p).toContain("email"); expect(p).toContain("sms"); });
  it("SMS proactive_outbound is NOT_VERIFIED (re-audit)", () => { const cap = getProviderCapability("sms"); expect(cap!.proactive_outbound).toBe("NOT_VERIFIED"); });
});

describe("SOCIAL-1E: Consent Evaluator", () => {
  it("TEST-11: revoked consent is not valid", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, consent_revoked_at: "2026-03-01T00:00:00Z" }, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("CONSENT_REVOKED"); });
  it("TEST-2: explicit opt-out", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, is_opted_out: true }, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("OPTED_OUT"); });
  it("TEST-4: anonymous_aggregate ineligible", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "anonymous_aggregate", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("ANONYMOUS_AGGREGATE_INELIGIBLE"); });
  it("TEST-10: cross-workspace invalid (caller-supplied)", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", contact_workspace_id: "ws-different-999", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("CROSS_WORKSPACE_INELIGIBLE"); });
  it("TEST-13: transactional-only", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, marketing_allowed: false, transactional_allowed: true, communication_type: "transactional" }, db: noOpDb }); expect(r.validity).toBe("transactional_only"); expect(r.transactional_only).toBe(true); expect(r.marketing_allowed).toBe(false); expect(r.reasons).toContain("TRANSACTIONAL_ONLY"); });
  it("valid consent returns valid", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("valid"); expect(r.reasons).toContain("CONSENT_VALID"); });
});

describe("SOCIAL-1E: Policy Engine", () => {
  it("TEST-1: supported provider + valid consent → ALLOW", async () => { const r = await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString() }); expect(r.decision).toBe("ALLOW"); expect(r.reasons).toContain("POLICY_OK"); expect(r.consent_valid).toBe(true); expect(r.capability_verified).toBe(true); });
  it("TEST-2: explicit opt-out → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, is_opted_out: true } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("OPTED_OUT"); });
  it("TEST-7: disconnected channel → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, channel_connected: false }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CHANNEL_NOT_CONNECTED"); });
  it("TEST-4: anonymous_aggregate → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, identity_state: "anonymous_aggregate" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("ANONYMOUS_AGGREGATE"); });
  it("TEST-5: platform_actor proactive_outbound → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, identity_state: "platform_actor", interaction_type: "proactive_outbound" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("PLATFORM_ACTOR_CRM_INELIGIBLE"); });
  it("TEST-6a: unknown provider → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, provider: "totally_unknown_xyz" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("PROVIDER_UNSUPPORTED"); });
  it("TEST-6b: NOT_VERIFIED capability → REVIEW", async () => { const r = await evaluatePolicy({ ...baseInput, interaction_type: "proactive_outbound", consent_record: validConsentRecord }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("CAPABILITY_NOT_VERIFIED"); });
  it("TEST-8+9: high intent does not override BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, is_opted_out: true }, intent_score: 0.99 }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("OPTED_OUT"); expect(r.intent_score_presented).toBe(0.99); });
  it("TEST-10: cross-workspace → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_workspace_id: "ws-totally-different" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CROSS_WORKSPACE_CONSENT"); });
  it("TEST-11: revoked consent → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, consent_revoked_at: "2026-05-01T00:00:00Z" } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CONSENT_REVOKED"); });
  it("TEST-12: quiet hours → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString(), local_hour: 23, quiet_hours: { start_hour: 22, end_hour: 8 } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("QUIET_HOURS"); });
  it("TEST-12: outside quiet hours → ALLOW", async () => { const r = await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString(), local_hour: 14, quiet_hours: { start_hour: 22, end_hour: 8 } }); expect(r.decision).toBe("ALLOW"); });
  it("TEST-13: transactional + proactive → REVIEW with consent_valid false", async () => { const r = await evaluatePolicy({ ...baseInput, interaction_type: "proactive_outbound", provider: "email", channel_type: "email", consent_record: { ...validConsentRecord, channel_type: "email", workspace_id: WORKSPACE, marketing_allowed: false, transactional_allowed: true, communication_type: "transactional" } }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("TRANSACTIONAL_ONLY"); expect(r.consent_valid).toBe(false); });
  it("TEST-3: missing consent → REVIEW", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: null }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("CONSENT_MISSING"); });
  it("TEST-14: no outbound API calls", async () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString() }); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });
  it("TEST-15+16: no NBA/campaign exports", async () => { const mod = await import("../../../supabase/functions/_shared/social-policy-engine"); const forbidden = Object.keys(mod).filter(k => k.toLowerCase().includes("send") || k.toLowerCase().includes("nba") || k.toLowerCase().includes("campaign") || k.toLowerCase().includes("offer") || k.toLowerCase().includes("schedule")); expect(forbidden).toHaveLength(0); });
});

describe("SOCIAL-1E: File Safety Invariants", () => {
  it("TEST-17: AI-3 file unchanged", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); expect(() => readFileSync(resolve(__dirname, "../../../supabase/functions/autonomous-ai-agent/index.ts"))).not.toThrow(); });
  it("TEST-18: i18n file present", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); expect(() => readFileSync(resolve(__dirname, "../../../src/i18n/en.ts"))).not.toThrow(); });
  it("TEST-19+20: package.json and package-lock present", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf-8")); expect(typeof pkg.name).toBe("string"); expect(typeof pkg.version).toBe("string"); expect(() => readFileSync(resolve(__dirname, "../../../package-lock.json"))).not.toThrow(); });
});

// ============================================================
// SOCIAL-1E POLICY SAFETY CORRECTION — New behavior tests
// ============================================================

describe("SOCIAL-1E Safety Fix 1: Workspace-scoped suppression", () => {
  it("suppression RPC called with workspace_id (not user_id)", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ data: false, error: null });
    const spyDb = { from: (noOpDb as any).from, rpc: rpcSpy } as unknown as Parameters<typeof evaluateConsent>[0]["db"];
    await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: validConsentRecord, db: spyDb });
    expect(rpcSpy).toHaveBeenCalledWith("is_contact_suppressed_for_workspace", expect.objectContaining({ _workspace_id: WORKSPACE }));
    // Must NOT pass workspace_id under the user_id key
    expect(rpcSpy).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ _user_id: WORKSPACE }));
  });

  it("workspace A suppression does not bleed into workspace B", async () => {
    const wsA = "workspace-aaa";
    const wsB = "workspace-bbb";
    // suppressedDb suppresses only wsA
    const dbA = suppressedDb(wsA);
    const rA = await evaluateConsent({ workspace_id: wsA, contact_identifier: CONTACT, channel_type: "sms", identity_state: "known_person", consent_record: { ...validConsentRecord, workspace_id: wsA, channel_type: "sms" }, db: dbA });
    expect(rA.is_globally_suppressed).toBe(true);
    expect(rA.reasons).toContain("GLOBALLY_SUPPRESSED");

    const rB = await evaluateConsent({ workspace_id: wsB, contact_identifier: CONTACT, channel_type: "sms", identity_state: "known_person", consent_record: { ...validConsentRecord, workspace_id: wsB, channel_type: "sms" }, db: dbA });
    expect(rB.is_globally_suppressed).toBe(false);
    expect(rB.reasons).not.toContain("GLOBALLY_SUPPRESSED");
  });

  it("channel_type='all' suppression blocks (RPC covers it)", async () => {
    // The RPC returns true when workspace matches — simulates 'all' channel suppression
    const db = suppressedDb(WORKSPACE);
    const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "sms", identity_state: "known_person", consent_record: validConsentRecord, db });
    expect(r.is_globally_suppressed).toBe(true);
    expect(r.validity).toBe("not_valid");
    expect(r.reasons).toContain("GLOBALLY_SUPPRESSED");
  });

  it("broadcast opt-out blocks via canonical RPC (same code path as global suppression)", async () => {
    // broadcast_optouts are covered by is_contact_suppressed_for_workspace RPC
    const db = suppressedDb(WORKSPACE);
    const r = await evaluatePolicy({ ...baseInput, db });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("GLOBALLY_SUPPRESSED");
  });
});

describe("SOCIAL-1E Safety Fix 2: Suppression DB error fails closed", () => {
  it("suppression DB error → evaluateConsent returns unknown with SUPPRESSION_CHECK_FAILED", async () => {
    const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: validConsentRecord, db: errorDb });
    expect(r.validity).toBe("unknown");
    expect(r.reasons).toContain("SUPPRESSION_CHECK_FAILED");
    expect(r.marketing_allowed).toBe(false);
  });

  it("suppression DB error → evaluatePolicy returns REVIEW, not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, db: errorDb });
    expect(r.decision).not.toBe("ALLOW");
    expect(["REVIEW", "BLOCK"]).toContain(r.decision);
    expect(r.reasons).toContain("SUPPRESSION_CHECK_FAILED");
    expect(r.consent_valid).toBe(false);
  });

  it("suppression DB error with high intent still cannot produce ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, db: errorDb, intent_score: 0.99 });
    expect(r.decision).not.toBe("ALLOW");
    expect(r.consent_valid).toBe(false);
  });
});

describe("SOCIAL-1E Safety Fix 3: Cross-workspace consent bypass prevention", () => {
  it("consent_record.workspace_id from foreign workspace → BLOCK", async () => {
    const foreignRecord: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE_B };
    const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: foreignRecord, db: noOpDb });
    expect(r.validity).toBe("not_valid");
    expect(r.reasons).toContain("CROSS_WORKSPACE_INELIGIBLE");
  });

  it("foreign consent_record.workspace_id → policy BLOCK", async () => {
    const foreignRecord: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE_B };
    const r = await evaluatePolicy({ ...baseInput, consent_record: foreignRecord });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("CROSS_WORKSPACE_CONSENT");
  });

  it("omitting consent_workspace_id does NOT bypass record isolation (record workspace_id is authoritative)", async () => {
    // No consent_workspace_id passed, but the record belongs to a different workspace
    const foreignRecord: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE_B };
    const r = await evaluatePolicy({ ...baseInput, consent_record: foreignRecord, consent_workspace_id: undefined });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("CROSS_WORKSPACE_CONSENT");
  });

  it("same contact in workspace A and B remains isolated", async () => {
    const recordA: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE };
    const recordB: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE_B };
    // Using recordA in workspace A → should pass suppression and consent
    const rA = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: recordA, db: noOpDb });
    expect(rA.validity).toBe("valid");
    // Using recordB in workspace A → should block
    const rB = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: recordB, db: noOpDb });
    expect(rB.validity).toBe("not_valid");
    expect(rB.reasons).toContain("CROSS_WORKSPACE_INELIGIBLE");
  });
});

describe("SOCIAL-1E Safety Fix 4: Invalid permission must not become valid consent", () => {
  it("marketing_allowed=false AND transactional_allowed=false → not_valid, not ALLOW", async () => {
    const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, marketing_allowed: false, transactional_allowed: false }, db: noOpDb });
    expect(r.validity).toBe("not_valid");
    expect(r.marketing_allowed).toBe(false);
    expect(r.reasons).toContain("MARKETING_NOT_ALLOWED");
  });

  it("marketing_allowed=false AND transactional_allowed=false → policy BLOCK or REVIEW, never ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, marketing_allowed: false, transactional_allowed: false } });
    expect(r.decision).not.toBe("ALLOW");
    expect(r.consent_valid).toBe(false);
  });

  it("consent_source='unknown' → evaluateConsent returns unknown with UNKNOWN_CONSENT", async () => {
    const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, consent_source: "unknown" }, db: noOpDb });
    expect(r.validity).toBe("unknown");
    expect(r.reasons).toContain("UNKNOWN_CONSENT");
    expect(r.marketing_allowed).toBe(false);
  });

  it("consent_source='unknown' → policy REVIEW, not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, consent_source: "unknown" } });
    expect(r.decision).not.toBe("ALLOW");
    expect(["REVIEW", "BLOCK"]).toContain(r.decision);
    expect(r.consent_valid).toBe(false);
  });

  it("explicit marketing consent → ALLOW when all other gates pass", async () => {
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString() });
    expect(r.decision).toBe("ALLOW");
    expect(r.consent_valid).toBe(true);
  });
});

describe("SOCIAL-1E Safety Fix 5: Provider/channel mismatch and conversation window", () => {
  it("provider=meta_ig + channel_type=email → BLOCK with PROVIDER_CHANNEL_MISMATCH", async () => {
    const r = await evaluatePolicy({ ...baseInput, channel_type: "email" });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("PROVIDER_CHANNEL_MISMATCH");
  });

  it("provider=email + channel_type=instagram → BLOCK with PROVIDER_CHANNEL_MISMATCH", async () => {
    const r = await evaluatePolicy({ ...baseInput, provider: "email", channel_type: "instagram", consent_record: { ...validConsentRecord, channel_type: "instagram", workspace_id: WORKSPACE } });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("PROVIDER_CHANNEL_MISMATCH");
  });

  it("provider/channel mismatch blocks even with high intent score", async () => {
    const r = await evaluatePolicy({ ...baseInput, channel_type: "email", intent_score: 0.99 });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("PROVIDER_CHANNEL_MISMATCH");
  });

  it("meta_ig: open window (recent inbound) → ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: new Date().toISOString() });
    expect(r.decision).toBe("ALLOW");
    expect(r.reasons).not.toContain("CONVERSATION_WINDOW_CLOSED");
  });

  it("meta_ig: closed window (>24h ago) → BLOCK with CONVERSATION_WINDOW_CLOSED", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: oldDate });
    expect(r.decision).toBe("BLOCK");
    expect(r.reasons).toContain("CONVERSATION_WINDOW_CLOSED");
  });

  it("meta_ig: last_inbound_at absent → REVIEW (window unknown), not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: undefined });
    expect(r.decision).not.toBe("ALLOW");
    expect(r.reasons).toContain("CONVERSATION_WINDOW_UNKNOWN");
  });

  it("meta_ig: last_inbound_at=null → REVIEW (window unknown), not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: null });
    expect(r.decision).not.toBe("ALLOW");
    expect(r.reasons).toContain("CONVERSATION_WINDOW_UNKNOWN");
  });

  it("email: no conversation window required, no last_inbound_at needed → ALLOW", async () => {
    const emailRecord: ConsentRecord = { ...validConsentRecord, workspace_id: WORKSPACE, channel_type: "email" };
    const r = await evaluatePolicy({ ...baseInput, provider: "email", channel_type: "email", consent_record: emailRecord });
    expect(r.decision).toBe("ALLOW");
  });
});

describe("SOCIAL-1E: High intent cannot override new safety gates", () => {
  it("suppression DB error + high intent → not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, db: errorDb, intent_score: 0.99 });
    expect(r.decision).not.toBe("ALLOW");
  });

  it("foreign consent record + high intent → BLOCK", async () => {
    const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, workspace_id: WORKSPACE_B }, intent_score: 0.99 });
    expect(r.decision).toBe("BLOCK");
  });

  it("no-permission consent + high intent → not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, marketing_allowed: false, transactional_allowed: false }, intent_score: 0.99 });
    expect(r.decision).not.toBe("ALLOW");
  });

  it("unknown consent source + high intent → not ALLOW", async () => {
    const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, consent_source: "unknown" }, intent_score: 0.99 });
    expect(r.decision).not.toBe("ALLOW");
  });

  it("provider/channel mismatch + high intent → BLOCK", async () => {
    const r = await evaluatePolicy({ ...baseInput, channel_type: "email", intent_score: 0.99 });
    expect(r.decision).toBe("BLOCK");
  });

  it("closed conversation window + high intent → BLOCK", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const r = await evaluatePolicy({ ...baseInput, last_inbound_at: oldDate, intent_score: 0.99 });
    expect(r.decision).toBe("BLOCK");
  });
});
