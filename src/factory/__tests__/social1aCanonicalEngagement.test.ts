/**
 * SOCIAL-1A — Canonical engagement event tests
 *
 * Covers:
 *   1. Valid Meta DM → exactly one canonical engagement event
 *   2. Duplicate provider event → no duplicate canonical event
 *   3. Correct workspace ownership
 *   4. Ambiguous workspace mapping → fail closed (no event emitted)
 *   5. Actor remains platform_actor; no first-party identity promotion
 *   6. No anonymous-to-known identity promotion
 *   7. Existing inbox/lead path does not regress
 *   8. No SOCIAL-1B functionality (identity graph, interest memory) appears
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  buildCanonicalEngagementEvent,
  type CanonicalEngagementEvent,
  type IdentityState,
} from "../../../supabase/functions/_shared/canonical-engagement-event";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

// ── 1 & 3 & 5. Valid Meta IG DM → canonical event with correct fields ────────

describe("buildCanonicalEngagementEvent — Instagram DM (SOCIAL-1A)", () => {
  const base = {
    workspace_id:      "ws-aaa",
    channel_id:        "ch-bbb",
    provider:          "meta_ig" as const,
    account_identifier: "ig_page_123",
    event_type:        "message_received" as const,
    provider_event_id: "mid.abc123",
    actor_provider_id: "ig_user_456",
    content_ref:       "Hello, I need help",
  };

  it("produces a canonical event with all required fields", () => {
    const ev = buildCanonicalEngagementEvent(base);

    expect(ev.workspace_id).toBe("ws-aaa");
    expect(ev.channel_id).toBe("ch-bbb");
    expect(ev.provider).toBe("meta_ig");
    expect(ev.account_identifier).toBe("ig_page_123");
    expect(ev.event_type).toBe("message_received");
    expect(ev.provider_event_id).toBe("mid.abc123");
    expect(ev.actor_provider_id).toBe("ig_user_456");
    expect(ev.content_ref).toBe("Hello, I need help");
  });

  it("idempotency key includes provider, workspace and event id", () => {
    const ev = buildCanonicalEngagementEvent(base);
    expect(ev.idempotency_key).toBe("seg:meta_ig:ws-aaa:mid.abc123");
  });

  it("source_ref is opaque provider:event_id — no secrets", () => {
    const ev = buildCanonicalEngagementEvent(base);
    expect(ev.source_ref).toBe("meta_ig:mid.abc123");
    // must not contain anything that looks like a token/key
    expect(ev.source_ref).not.toMatch(/Bearer|secret|token|key/i);
  });

  // ── 5. Actor stays platform_actor ────────────────────────────────────────────

  it("actor_identity_state defaults to platform_actor when actor_provider_id is set", () => {
    const ev = buildCanonicalEngagementEvent(base);
    expect(ev.actor_identity_state).toBe("platform_actor");
    expect(ev.is_anonymous_aggregate).toBe(false);
  });

  it("explicit platform_actor override is accepted", () => {
    const ev = buildCanonicalEngagementEvent({
      ...base,
      actor_identity_state: "platform_actor",
    });
    expect(ev.actor_identity_state).toBe("platform_actor");
  });

  // ── 6. No anonymous-to-known promotion ──────────────────────────────────────

  it("throws when anonymous_aggregate is set with a non-null actor_provider_id", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        ...base,
        actor_identity_state: "anonymous_aggregate",
        actor_provider_id:    "some_user_id",
      }),
    ).toThrow(/anonymous_aggregate.*incompatible/i);
  });

  it("throws when known_person is set — SOCIAL-1A lawful-linkage guard (SOCIAL-1B territory)", () => {
    // SOCIAL-1A must NOT allow arbitrary promotion to known_person.
    // This guard fires regardless of whether actor_provider_id is provided.
    expect(() =>
      buildCanonicalEngagementEvent({
        ...base,
        actor_identity_state: "known_person",
        actor_provider_id:    "some_user_id",
      }),
    ).toThrow(/known_person.*SOCIAL-1B/i);

    expect(() =>
      buildCanonicalEngagementEvent({
        ...base,
        actor_identity_state: "known_person",
        actor_provider_id:    null,
      }),
    ).toThrow(/known_person.*SOCIAL-1B/i);
  });

  it("throws when platform_actor is set without an actor_provider_id — fail closed", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        ...base,
        actor_identity_state: "platform_actor",
        actor_provider_id:    null,
      }),
    ).toThrow(/platform_actor.*requires.*non-null/i);
  });

  it("throws when pseudonymous_visitor is set without an actor_provider_id", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        ...base,
        actor_identity_state: "pseudonymous_visitor",
        actor_provider_id:    null,
      }),
    ).toThrow(/pseudonymous_visitor.*requires/i);
  });

  it("null actor_provider_id produces anonymous_aggregate state", () => {
    const ev = buildCanonicalEngagementEvent({
      ...base,
      actor_provider_id: null,
    });
    expect(ev.actor_identity_state).toBe("anonymous_aggregate");
    expect(ev.is_anonymous_aggregate).toBe(true);
    expect(ev.actor_provider_id).toBeNull();
  });

  // ── 3. Workspace ownership ───────────────────────────────────────────────────

  it("workspace_id on the event matches the input workspace_id", () => {
    const ev = buildCanonicalEngagementEvent({ ...base, workspace_id: "ws-xyz" });
    expect(ev.workspace_id).toBe("ws-xyz");
  });

  // ── Consent / policy defaults ────────────────────────────────────────────────

  it("defaults consent_classification to platform_terms when not specified", () => {
    const ev = buildCanonicalEngagementEvent(base);
    expect(ev.consent_classification).toBe("platform_terms");
  });
});

// ── Valid Meta FB Messenger DM ────────────────────────────────────────────────

describe("buildCanonicalEngagementEvent — Facebook Messenger DM (SOCIAL-1A)", () => {
  const base = {
    workspace_id:      "ws-fb-1",
    channel_id:        "ch-fb-1",
    provider:          "meta_fb" as const,
    account_identifier: "fb_page_789",
    event_type:        "message_received" as const,
    provider_event_id: "mid.fb999",
    actor_provider_id: "fb_user_123",
    content_ref:       "Hey there",
  };

  it("produces a canonical FB event with platform_actor identity state", () => {
    const ev = buildCanonicalEngagementEvent(base);
    expect(ev.provider).toBe("meta_fb");
    expect(ev.actor_identity_state).toBe("platform_actor");
    expect(ev.idempotency_key).toBe("seg:meta_fb:ws-fb-1:mid.fb999");
  });
});

// ── 2. Duplicate provider event → idempotency key is stable (same input = same key) ──

describe("Idempotency: same provider event always produces the same key", () => {
  it("two calls with same provider_event_id produce identical idempotency_keys", () => {
    const input = {
      workspace_id:      "ws-1",
      channel_id:        "ch-1",
      provider:          "meta_ig" as const,
      account_identifier: "page1",
      event_type:        "message_received" as const,
      provider_event_id: "mid.dup",
      actor_provider_id: "user1",
      content_ref:       "hello",
    };
    const ev1 = buildCanonicalEngagementEvent(input);
    const ev2 = buildCanonicalEngagementEvent(input);
    expect(ev1.idempotency_key).toBe(ev2.idempotency_key);
    expect(ev1.idempotency_key).toBe("seg:meta_ig:ws-1:mid.dup");
  });
});

// ── 4. Ambiguous workspace mapping — fail-closed in meta-webhook ─────────────

describe("meta-webhook: ambiguous workspace mapping fails closed (SOCIAL-0 contract)", () => {
  it("meta-webhook source returns AMBIGUOUS string and quarantines — verify source marker", () => {
    const src = readFileSync(
      repoFile("supabase", "functions", "meta-webhook", "index.ts"),
      "utf-8",
    );
    // resolveWorkspaceFromPage returns "AMBIGUOUS" when multiple channels match
    expect(src).toContain('if (matches.length > 1) return "AMBIGUOUS"');
    expect(src).toContain("quarantining");
    // No side effects allowed on ambiguous; canonical event must not be emitted
    // (the `continue` statement fires before the canonical event block)
    expect(src).toContain("if (ws === \"AMBIGUOUS\")");
  });
});

// ── 7. Existing inbox/lead path does not regress ─────────────────────────────

describe("meta-webhook: existing inbox/lead path preserved (SOCIAL-1A non-regression)", () => {
  const src = readFileSync(
    repoFile("supabase", "functions", "meta-webhook", "index.ts"),
    "utf-8",
  );

  it("inbox_messages insert still present for Instagram", () => {
    expect(src).toContain('channel_type:       "instagram"');
  });

  it("inbox_messages insert still present for Facebook Messenger", () => {
    expect(src).toContain('channel_type:       "facebook"');
  });

  it("leads upsert still present", () => {
    expect(src).toContain('from("leads").upsert');
  });

  it("processed_webhook_events claim still fires before side effects", () => {
    const claimIdx    = src.indexOf('from("processed_webhook_events")');
    const inboxIdx    = src.indexOf('from("inbox_messages")');
    // Find the tryCanonicalInsert call in the normal (non-duplicate) path — after inbox
    const tryCanIdx   = src.indexOf("await tryCanonicalInsert(sb,", inboxIdx);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(inboxIdx).toBeGreaterThan(claimIdx);
    expect(tryCanIdx).toBeGreaterThan(inboxIdx);
  });

  it("canonical event emission is present in both IG and FB paths", () => {
    const igIdx  = src.indexOf('"meta_ig"');
    const fbIdx  = src.indexOf('"meta_fb"');
    const segIdx = src.indexOf('"social_engagement_events"');
    expect(igIdx).toBeGreaterThan(-1);
    expect(fbIdx).toBeGreaterThan(-1);
    expect(segIdx).toBeGreaterThan(-1);
  });
});

// ── 8. No SOCIAL-1B functionality ────────────────────────────────────────────

describe("SOCIAL-1B exclusion: identity graph and interest memory must not appear", () => {
  const metaSrc = readFileSync(
    repoFile("supabase", "functions", "meta-webhook", "index.ts"),
    "utf-8",
  );
  const canonicalSrc = readFileSync(
    repoFile("supabase", "functions", "_shared", "canonical-engagement-event.ts"),
    "utf-8",
  );

  it("meta-webhook does not reference identity_graph table", () => {
    expect(metaSrc).not.toContain("identity_graph");
  });

  it("meta-webhook does not reference interest_memory", () => {
    expect(metaSrc).not.toContain("interest_memory");
  });

  it("canonical model does not reference identity_graph", () => {
    expect(canonicalSrc).not.toContain("identity_graph");
  });

  it("canonical model does not reference interest_memory", () => {
    expect(canonicalSrc).not.toContain("interest_memory");
  });

  it("canonical model does not promote known_person without lawful linkage comment", () => {
    // The canonical model explicitly notes SOCIAL-1B territory
    expect(canonicalSrc).toContain("SOCIAL-1B");
  });

  it("meta-webhook does not implement NBA (next-best-action) scoring", () => {
    expect(metaSrc).not.toContain("journey_scor");
    expect(metaSrc).not.toContain("nba_");
  });

  it("canonical model does not reference silent-viewer deanonymization", () => {
    expect(canonicalSrc).not.toContain("deanon");
    expect(canonicalSrc).not.toContain("silent_viewer");
  });
});

// ── Migration: social_engagement_events table defined ───────────────────────

describe("migration: social_engagement_events table", () => {
  const migration = readFileSync(
    repoFile("supabase", "migrations", "20260822120000_social_engagement_events.sql"),
    "utf-8",
  );

  it("creates the social_engagement_events table", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.social_engagement_events");
  });

  it("has a UNIQUE index on idempotency_key for dedup", () => {
    expect(migration).toContain("uq_social_engagement_events_idempotency");
    expect(migration).toContain("idempotency_key");
  });

  it("includes actor_identity_state CHECK constraint", () => {
    expect(migration).toContain("actor_identity_state");
    expect(migration).toContain("CHECK");
    expect(migration).toContain("anonymous_aggregate");
  });

  it("enables RLS", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("only service_role may insert", () => {
    expect(migration).toContain("service_role_insert_social_engagement_events");
    expect(migration).toContain("FOR INSERT TO service_role");
  });

  // ── DB identity invariant CHECK constraints ──────────────────────────────────

  it("enforces platform_actor requires actor_provider_id via CHECK constraint", () => {
    expect(migration).toContain("chk_platform_actor_has_actor_id");
    expect(migration).toContain("actor_identity_state != 'platform_actor' OR actor_provider_id IS NOT NULL");
  });

  it("enforces pseudonymous_visitor requires actor_provider_id via CHECK constraint", () => {
    expect(migration).toContain("chk_pseudonymous_visitor_has_actor_id");
    expect(migration).toContain("actor_identity_state != 'pseudonymous_visitor' OR actor_provider_id IS NOT NULL");
  });

  it("enforces anonymous_aggregate has null actor_provider_id via CHECK constraint", () => {
    expect(migration).toContain("chk_anonymous_aggregate_no_actor_id");
    expect(migration).toContain("actor_identity_state != 'anonymous_aggregate' OR actor_provider_id IS NULL");
  });

  it("enforces is_anonymous_aggregate flag aligns with identity state via CHECK constraint", () => {
    expect(migration).toContain("chk_anonymous_aggregate_flag_aligned");
    expect(migration).toContain("is_anonymous_aggregate = (actor_identity_state = 'anonymous_aggregate')");
  });
});

// ── META TIMESTAMP NORMALIZATION ─────────────────────────────────────────────

describe("Meta timestamp normalization — 13-digit ms epoch", () => {
  it("realistic 13-digit Meta timestamp produces the correct ISO timestamp", () => {
    // Meta messaging[].timestamp is milliseconds since epoch (13 digits for modern dates).
    // 1753228800000 ms = 2025-07-23T00:00:00.000Z
    const metaTimestampMs = 1753228800000;
    expect(metaTimestampMs.toString()).toHaveLength(13);

    const iso = new Date(metaTimestampMs).toISOString();
    expect(iso).toBe("2025-07-23T00:00:00.000Z");

    // The canonical event must preserve this timestamp unchanged
    const ev = buildCanonicalEngagementEvent({
      workspace_id:      "ws-ts-test",
      channel_id:        "ch-ts-test",
      provider:          "meta_ig" as const,
      account_identifier: "page_ts_test",
      event_type:        "message_received" as const,
      provider_event_id: "mid.ts_test",
      actor_provider_id: "user_ts",
      content_ref:       "timestamp test",
      event_timestamp:   iso,
    });
    expect(ev.event_timestamp).toBe("2025-07-23T00:00:00.000Z");
  });

  it("meta-webhook source does NOT multiply timestamp by 1000 (no *1000 pattern)", () => {
    const src = readFileSync(
      repoFile("supabase", "functions", "meta-webhook", "index.ts"),
      "utf-8",
    );
    // tryCanonicalInsert must use new Date(raw_timestamp), never new Date(raw_timestamp * 1000)
    expect(src).not.toContain("* 1000");
  });
});

// ── PRODUCT TRUTH: message_sent is STRUCTURAL CAPABILITY, not LIVE ───────────

describe("Product truth: message_sent is structural capability", () => {
  it("message_sent is NOT in LiveEngagementEventType", () => {
    // The export type declaration for LiveEngagementEventType must NOT contain message_sent
    expect(canonicalSrc).not.toMatch(/export type LiveEngagementEventType\s*=[^;]*message_sent/);
  });

  it("message_sent IS in StructuralCapabilityEventType", () => {
    expect(canonicalSrc).toContain('"message_sent"');
    expect(canonicalSrc).toContain("StructuralCapabilityEventType");
    // Verify message_sent appears in the structural section (after StructuralCapabilityEventType)
    const structIdx = canonicalSrc.indexOf("StructuralCapabilityEventType");
    const msgSentIdx = canonicalSrc.indexOf('"message_sent"');
    expect(msgSentIdx).toBeGreaterThan(structIdx);
  });
});

// ── CANONICAL EVENT DURABILITY ────────────────────────────────────────────────

describe("canonical event durability: duplicate claim still attempts canonical insert", () => {
  const src = readFileSync(
    repoFile("supabase", "functions", "meta-webhook", "index.ts"),
    "utf-8",
  );

  it("on duplicate claim, tryCanonicalInsert is called before continue (IG path)", () => {
    // After the duplicate claim block, meta-webhook must call tryCanonicalInsert,
    // not just `continue`, to recover a canonical event that may have been lost
    // on the first delivery due to a transient DB error.
    expect(src).toContain('if (claim === "duplicate")');
    const dupIdx = src.indexOf('if (claim === "duplicate")');
    const tryIdx = src.indexOf("tryCanonicalInsert", dupIdx);
    const contIdx = src.indexOf("continue", dupIdx);
    // tryCanonicalInsert must appear before continue inside the duplicate block
    expect(tryIdx).toBeGreaterThan(dupIdx);
    expect(tryIdx).toBeLessThan(contIdx);
  });

  it("tryCanonicalInsert helper exists and is called for both IG and FB paths", () => {
    expect(src).toContain("async function tryCanonicalInsert");
    // Should be called at least twice (IG + FB + durability paths)
    const count = (src.match(/tryCanonicalInsert\(/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(4); // declaration + IG dup + IG normal + FB dup + FB normal
  });
});

const canonicalSrc = readFileSync(
  repoFile("supabase", "functions", "_shared", "canonical-engagement-event.ts"),
  "utf-8",
);
