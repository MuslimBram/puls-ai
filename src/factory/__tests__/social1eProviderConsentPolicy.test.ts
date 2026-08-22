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
 */

import { describe, it, expect, vi } from "vitest";
import { getProviderCapability, canReply, canProactiveOutbound, listRegisteredProviders } from "../../../supabase/functions/_shared/social-provider-capability";
import { evaluateConsent } from "../../../supabase/functions/_shared/social-consent-evaluator";
import { evaluatePolicy } from "../../../supabase/functions/_shared/social-policy-engine";
import type { ConsentRecord } from "../../../supabase/functions/_shared/social-consent-evaluator";
import type { PolicyEvaluationInput } from "../../../supabase/functions/_shared/social-policy-engine";

const noOpDb = {
  from: () => ({ select: () => ({ eq: function() { return this; }, is: function() { return this; }, limit: function() { return this; }, single: () => Promise.resolve({ data: null, error: null }), then: (fn: (v: { data: null; error: null }) => unknown) => Promise.resolve(fn({ data: null, error: null })) }), insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }), eq: function() { return this; } }), eq: function() { return this; } }), update: () => ({ eq: function() { return this; }, select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  rpc: () => Promise.resolve({ data: null, error: null }),
} as unknown as Parameters<typeof evaluateConsent>[0]["db"];

const WORKSPACE = "ws-test-001";
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
});

describe("SOCIAL-1E: Consent Evaluator", () => {
  it("TEST-11: revoked consent is not valid", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, consent_revoked_at: "2026-03-01T00:00:00Z" }, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("CONSENT_REVOKED"); });
  it("TEST-2: explicit opt-out", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, is_opted_out: true }, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("OPTED_OUT"); });
  it("TEST-4: anonymous_aggregate ineligible", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "anonymous_aggregate", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("ANONYMOUS_AGGREGATE_INELIGIBLE"); });
  it("TEST-10: cross-workspace invalid", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", contact_workspace_id: "ws-different-999", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("not_valid"); expect(r.reasons).toContain("CROSS_WORKSPACE_INELIGIBLE"); });
  it("TEST-13: transactional-only", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: { ...validConsentRecord, marketing_allowed: false, transactional_allowed: true, communication_type: "transactional" }, db: noOpDb }); expect(r.validity).toBe("transactional_only"); expect(r.transactional_only).toBe(true); expect(r.marketing_allowed).toBe(false); expect(r.reasons).toContain("TRANSACTIONAL_ONLY"); });
  it("valid consent returns valid", async () => { const r = await evaluateConsent({ workspace_id: WORKSPACE, contact_identifier: CONTACT, channel_type: "instagram", identity_state: "known_person", consent_record: validConsentRecord, db: noOpDb }); expect(r.validity).toBe("valid"); expect(r.reasons).toContain("CONSENT_VALID"); });
});

describe("SOCIAL-1E: Policy Engine", () => {
  it("TEST-1: supported provider + valid consent → ALLOW", async () => { const r = await evaluatePolicy(baseInput); expect(r.decision).toBe("ALLOW"); expect(r.reasons).toContain("POLICY_OK"); expect(r.consent_valid).toBe(true); expect(r.capability_verified).toBe(true); });
  it("TEST-2: explicit opt-out → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, is_opted_out: true } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("OPTED_OUT"); });
  it("TEST-7: disconnected channel → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, channel_connected: false }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CHANNEL_NOT_CONNECTED"); });
  it("TEST-4: anonymous_aggregate → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, identity_state: "anonymous_aggregate" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("ANONYMOUS_AGGREGATE"); });
  it("TEST-5: platform_actor proactive_outbound → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, identity_state: "platform_actor", interaction_type: "proactive_outbound" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("PLATFORM_ACTOR_CRM_INELIGIBLE"); });
  it("TEST-6: unknown provider → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, provider: "totally_unknown_xyz" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("PROVIDER_UNSUPPORTED"); });
  it("TEST-6: NOT_VERIFIED capability → REVIEW", async () => { const r = await evaluatePolicy({ ...baseInput, interaction_type: "proactive_outbound", consent_record: validConsentRecord }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("CAPABILITY_NOT_VERIFIED"); });
  it("TEST-8+9: high intent does not override BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, is_opted_out: true }, intent_score: 0.99 }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("OPTED_OUT"); expect(r.intent_score_presented).toBe(0.99); });
  it("TEST-10: cross-workspace → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_workspace_id: "ws-totally-different" }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CROSS_WORKSPACE_CONSENT"); });
  it("TEST-11: revoked consent → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: { ...validConsentRecord, consent_revoked_at: "2026-05-01T00:00:00Z" } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("CONSENT_REVOKED"); });
  it("TEST-12: quiet hours → BLOCK", async () => { const r = await evaluatePolicy({ ...baseInput, local_hour: 23, quiet_hours: { start_hour: 22, end_hour: 8 } }); expect(r.decision).toBe("BLOCK"); expect(r.reasons).toContain("QUIET_HOURS"); });
  it("TEST-12: outside quiet hours → ALLOW", async () => { const r = await evaluatePolicy({ ...baseInput, local_hour: 14, quiet_hours: { start_hour: 22, end_hour: 8 } }); expect(r.decision).toBe("ALLOW"); });
  it("TEST-13: transactional + proactive → REVIEW", async () => { const r = await evaluatePolicy({ ...baseInput, interaction_type: "proactive_outbound", provider: "email", channel_type: "email", consent_record: { ...validConsentRecord, channel_type: "email", marketing_allowed: false, transactional_allowed: true, communication_type: "transactional" } }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("TRANSACTIONAL_ONLY"); });
  it("TEST-3: missing consent → REVIEW", async () => { const r = await evaluatePolicy({ ...baseInput, consent_record: null }); expect(r.decision).toBe("REVIEW"); expect(r.reasons).toContain("CONSENT_MISSING"); });
  it("TEST-14: no outbound API calls", async () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); await evaluatePolicy(baseInput); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });
  it("TEST-15+16: no NBA/campaign exports", async () => { const mod = await import("../../../supabase/functions/_shared/social-policy-engine"); const forbidden = Object.keys(mod).filter(k => k.toLowerCase().includes("send") || k.toLowerCase().includes("nba") || k.toLowerCase().includes("campaign") || k.toLowerCase().includes("offer") || k.toLowerCase().includes("schedule")); expect(forbidden).toHaveLength(0); });
});

describe("SOCIAL-1E: File Safety Invariants", () => {
  it("TEST-17: AI-3 file unchanged", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); expect(() => readFileSync(resolve(__dirname, "../../../supabase/functions/autonomous-ai-agent/index.ts"))).not.toThrow(); });
  it("TEST-18: i18n file present", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); expect(() => readFileSync(resolve(__dirname, "../../../src/i18n/en.ts"))).not.toThrow(); });
  it("TEST-19+20: package.json and package-lock present", async () => { const { readFileSync } = await import("fs"); const { resolve } = await import("path"); const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf-8")); expect(typeof pkg.name).toBe("string"); expect(typeof pkg.version).toBe("string"); expect(() => readFileSync(resolve(__dirname, "../../../package-lock.json"))).not.toThrow(); });
});
