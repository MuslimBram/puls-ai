/**
 * SOCIAL-1C — Canonical Interest Memory tests
 */

import { describe, it, expect } from "vitest";

import {
  processInterestFromEngagementEvent,
  processInterestFromEngagementEventId,
  extractInterestSignals,
  type CanonicalEngagementRow,
} from "../../../supabase/functions/_shared/social-interest-memory";

import {
  createVerifiedLink,
  resolveIdentity,
  revokeIdentityLink,
  type IdentityGraphClient,
  type IdentityNode,
  type IdentityLink,
  type CanonicalPerson,
  type LinkageEvidence,
} from "../../../supabase/functions/_shared/identity-graph";

type InterestMemoryRow = {
  id: string;
  workspace_id: string;
  canonical_person_id: string | null;
  identity_node_id: string | null;
  provider: string;
  account_identifier: string;
  actor_provider_id: string;
  actor_identity_state: "known_person" | "platform_actor" | "pseudonymous_visitor";
  resolved_identity_key: string;
  interest_type: "topic" | "category" | "product" | "service";
  interest_ref: string;
  source_provider: string;
  evidence_count: number;
  strength: number;
  first_seen_at: string;
  last_seen_at: string;
  state: "active" | "revoked" | "expired";
  revoked_at?: string;
  revocation_reason?: string;
};

type InterestEvidenceRow = {
  id: string;
  workspace_id: string;
  engagement_event_id: string;
  interest_memory_id?: string | null;
  provider: string;
  source_provider: string;
  source_ref: string;
  actor_provider_id?: string | null;
  interest_type: "topic" | "category" | "product" | "service";
  interest_ref: string;
  evidence_type: string;
  evidence_timestamp: string;
  evidence_count: number;
  state: "active" | "revoked" | "expired";
};

type EngagementRow = CanonicalEngagementRow;

type TableRows = {
  canonical_persons: CanonicalPerson[];
  identity_nodes: IdentityNode[];
  identity_links: IdentityLink[];
  social_engagement_events: EngagementRow[];
  social_interest_memory: InterestMemoryRow[];
  social_interest_evidence: InterestEvidenceRow[];
  customer_journey: Array<Record<string, unknown>>;
  journey_transitions: Array<Record<string, unknown>>;
  nba_actions: Array<Record<string, unknown>>;
};

function nowIso() {
  return new Date().toISOString();
}

function makeEvent(overrides: Partial<EngagementRow> = {}): EngagementRow {
  const ts = overrides.event_timestamp ?? nowIso();
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    workspace_id: overrides.workspace_id ?? "ws-A",
    provider: overrides.provider ?? "meta_ig",
    account_identifier: overrides.account_identifier ?? "page-1",
    event_type: overrides.event_type ?? "message_received",
    actor_provider_id: overrides.actor_provider_id ?? "actor-1",
    actor_identity_state: overrides.actor_identity_state ?? "platform_actor",
    is_anonymous_aggregate: overrides.is_anonymous_aggregate ?? false,
    content_ref: overrides.content_ref ?? "interested in product laptop",
    event_timestamp: ts,
    source_ref: overrides.source_ref ?? `meta_ig:${overrides.id ?? "event"}`,
    normalized_metadata: overrides.normalized_metadata ?? {},
  };
}

function makeInMemoryDb(tables: TableRows = {
  canonical_persons: [],
  identity_nodes: [],
  identity_links: [],
  social_engagement_events: [],
  social_interest_memory: [],
  social_interest_evidence: [],
  customer_journey: [],
  journey_transitions: [],
  nba_actions: [],
}): IdentityGraphClient & { _tables: TableRows; _writes: string[] } {
  let idCounter = 0;
  const writes: string[] = [];
  const nextId = () => `id-${++idCounter}`;

  function fromTable<T extends { id?: string; workspace_id?: string }>(tableName: keyof TableRows | string) {
    const rows = (tables as Record<string, any[]>)[tableName as string] ?? [];
    if (!(tableName in tables)) (tables as Record<string, any[]>)[tableName as string] = rows;

    let pendingInsert: Partial<T> | null = null;
    let pendingUpdate: Partial<T> | null = null;
    let onConflictColumns: string[] = [];
    let filters: Array<(row: T) => boolean> = [];
    let limitCount: number | null = null;

    const builder: any = {
      select(_cols?: string) { return builder; },

      insert(values: Partial<T> | Partial<T>[], opts?: { onConflict?: string }) {
        const arr = Array.isArray(values) ? values : [values];
        pendingInsert = arr[0];
        onConflictColumns = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : [];
        return builder;
      },

      update(values: Partial<T>) {
        pendingUpdate = values;
        return builder;
      },

      eq(col: string, val: unknown) {
        filters.push((row: T) => (row as any)[col] === val);
        return builder;
      },

      is(col: string, _val: null) {
        filters.push((row: T) => (row as any)[col] == null);
        return builder;
      },

      limit(n: number) {
        limitCount = n;
        return builder;
      },

      single(): Promise<{ data: T | null; error: null | { message: string; code?: string } }> {
        if (pendingInsert !== null) {
          const candidate = pendingInsert;

          if ((tableName as string) === "social_interest_evidence") {
            const conflict = rows.find((r: any) =>
              r.workspace_id === (candidate as any).workspace_id
              && r.engagement_event_id === (candidate as any).engagement_event_id
              && r.interest_type === (candidate as any).interest_type
              && r.interest_ref === (candidate as any).interest_ref,
            );
            if (conflict) {
              pendingInsert = null;
              return Promise.resolve({ data: null, error: { message: "duplicate", code: "23505" } });
            }
          }

          if ((tableName as string) === "social_interest_memory") {
            const conflict = rows.find((r: any) =>
              r.workspace_id === (candidate as any).workspace_id
              && r.resolved_identity_key === (candidate as any).resolved_identity_key
              && r.interest_type === (candidate as any).interest_type
              && r.interest_ref === (candidate as any).interest_ref
              && r.state === "active",
            );
            if (conflict) {
              pendingInsert = null;
              return Promise.resolve({ data: null, error: { message: "duplicate-active-memory", code: "23505" } });
            }
          }

          if (onConflictColumns.length > 0) {
            const conflict = rows.find((r: any) =>
              onConflictColumns.every((col) => r[col] === (candidate as any)[col]),
            );
            if (conflict) {
              pendingInsert = null;
              onConflictColumns = [];
              return Promise.resolve({ data: null, error: null });
            }
          }

          const row = {
            id: nextId(),
            created_at: nowIso(),
            updated_at: nowIso(),
            ...candidate,
          } as T;

          rows.push(row);
          writes.push(`${String(tableName)}:insert`);
          pendingInsert = null;
          onConflictColumns = [];
          return Promise.resolve({ data: row, error: null });
        }

        if (pendingUpdate !== null) {
          const matched = rows.filter((r: T) => filters.every((f) => f(r)));
          if (!matched.length) {
            pendingUpdate = null;
            return Promise.resolve({ data: null, error: null });
          }
          Object.assign(matched[0], pendingUpdate, { updated_at: nowIso() });
          writes.push(`${String(tableName)}:update`);
          pendingUpdate = null;
          return Promise.resolve({ data: matched[0], error: null });
        }

        const results = rows.filter((r: T) => filters.every((f) => f(r)));
        const limited = limitCount !== null ? results.slice(0, limitCount) : results;
        return Promise.resolve({ data: limited[0] ?? null, error: null });
      },

      then(resolve: (value: { data: T[]; error: null }) => any) {
        if (pendingInsert !== null) {
          const row = { id: nextId(), created_at: nowIso(), updated_at: nowIso(), ...pendingInsert } as T;
          rows.push(row);
          writes.push(`${String(tableName)}:insert`);
          pendingInsert = null;
          return Promise.resolve({ data: [row], error: null }).then(resolve);
        }

        if (pendingUpdate !== null) {
          const matched = rows.filter((r: T) => filters.every((f) => f(r)));
          matched.forEach((m) => Object.assign(m, pendingUpdate, { updated_at: nowIso() }));
          if (matched.length) writes.push(`${String(tableName)}:update`);
          pendingUpdate = null;
          return Promise.resolve({ data: matched, error: null }).then(resolve);
        }

        const results = rows.filter((r: T) => filters.every((f) => f(r)));
        const limited = limitCount !== null ? results.slice(0, limitCount) : results;
        return Promise.resolve({ data: limited, error: null }).then(resolve);
      },
    };

    return builder;
  }

  function rpcResolveIdentity(args: {
    p_workspace_id: string;
    p_provider: string;
    p_account_identifier: string;
    p_actor_provider_id: string | null;
  }): Promise<{ data: string | null; error: null }> {
    if (!args.p_actor_provider_id) return Promise.resolve({ data: "anonymous_aggregate", error: null });

    const norm = args.p_actor_provider_id.toLowerCase().trim();

    const node = tables.identity_nodes.find(
      (n) => n.workspace_id === args.p_workspace_id
        && n.node_type === "provider_actor"
        && n.provider === args.p_provider
        && n.provider_scope === args.p_account_identifier
        && n.normalized_value === norm,
    );

    if (!node) return Promise.resolve({ data: "unresolved", error: null });

    const activeLinks = tables.identity_links.filter(
      (l) => l.workspace_id === args.p_workspace_id
        && l.identity_node_id === node.id
        && !l.is_revoked
        && l.confidence === "deterministic",
    );

    if (!activeLinks.length) return Promise.resolve({ data: "platform_actor", error: null });

    const personIds = new Set(activeLinks.map((l) => l.canonical_person_id));
    if (personIds.size > 1) return Promise.resolve({ data: "ambiguous", error: null });

    return Promise.resolve({ data: "known_person", error: null });
  }

  return {
    _tables: tables,
    _writes: writes,
    from<T = unknown>(table: string) {
      return fromTable<T & { id?: string; workspace_id?: string }>(table);
    },
    rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
      if (fn === "resolve_identity") {
        return rpcResolveIdentity(args as any) as Promise<{ data: T | null; error: null }>;
      }
      return Promise.resolve({ data: null as T | null, error: { message: `unknown rpc: ${fn}` } });
    },
  } as any;
}

const evidence: LinkageEvidence = {
  linkage_type: "verified_email",
  verified_identifier: "user@example.com",
  source_system: "test-auth",
  verification_timestamp: "2026-08-22T00:00:00Z",
};

describe("SOCIAL-1C extraction", () => {
  it("extracts deterministic interest signals", () => {
    const signals = extractInterestSignals("Need service onboarding and product analytics please");
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.interest_type === "service" && s.interest_ref === "onboarding")).toBe(true);
  });
});

describe("SOCIAL-1C behavior", () => {
  it("real canonical Meta DM event creates interest evidence", async () => {
    const db = makeInMemoryDb();
    const event = makeEvent({ id: "evt-1", content_ref: "I want product camera and service setup" });
    db._tables.social_engagement_events.push(event);

    const result = await processInterestFromEngagementEventId(db, "evt-1");
    expect(result.status).toBe("processed");
    expect(result.evidence_inserted).toBeGreaterThan(0);
    expect(db._tables.social_interest_evidence.length).toBeGreaterThan(0);
  });

  it("same canonical event processed twice does not double count", async () => {
    const db = makeInMemoryDb();
    const event = makeEvent({ id: "evt-dup", content_ref: "product camera" });

    await processInterestFromEngagementEvent(db, event);
    await processInterestFromEngagementEvent(db, event);

    const memory = db._tables.social_interest_memory.find((m) => m.interest_type === "product" && m.interest_ref === "camera");
    expect(memory).toBeTruthy();
    expect(memory?.evidence_count).toBe(1);
  });

  it("repeated distinct engagements deterministically accumulate evidence", async () => {
    const db = makeInMemoryDb();

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-a", content_ref: "product camera" }));
    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-b", content_ref: "product camera" }));

    const memory = db._tables.social_interest_memory.find((m) => m.interest_type === "product" && m.interest_ref === "camera");
    expect(memory?.evidence_count).toBe(2);
    expect(memory?.strength).toBeGreaterThan(0.2);
  });

  it("platform_actor interest remains provider-scoped without lawful linkage", async () => {
    const db = makeInMemoryDb();

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-platform", actor_provider_id: "actor-x", content_ref: "service repair" }));

    const memory = db._tables.social_interest_memory.find((m) => m.interest_type === "service" && m.interest_ref === "repair");
    expect(memory?.canonical_person_id).toBeNull();
    expect(memory?.resolved_identity_key).toContain("actor:meta_ig:page-1:actor-x");
    expect(memory?.actor_identity_state).toBe("platform_actor");
  });

  it("verified known_person linkage resolves memory to canonical person", async () => {
    const db = makeInMemoryDb();

    const link = await createVerifiedLink({
      workspace_id: "ws-A",
      provider: "meta_ig",
      provider_scope: "page-1",
      actor_provider_id: "actor-known",
      evidence,
      db,
    });

    const resolution = await resolveIdentity("ws-A", "meta_ig", "page-1", "actor-known", db);
    expect(resolution.canonical_state).toBe("known_person");

    await processInterestFromEngagementEvent(db, makeEvent({
      id: "evt-known",
      actor_provider_id: "actor-known",
      content_ref: "service consulting",
    }));

    const memory = db._tables.social_interest_memory.find((m) => m.interest_type === "service" && m.interest_ref === "consulting");
    expect(memory?.canonical_person_id).toBe(link.canonical_person_id);
    expect(memory?.actor_identity_state).toBe("known_person");
  });

  it("anonymous_aggregate does not create person-level interest memory", async () => {
    const db = makeInMemoryDb();
    const result = await processInterestFromEngagementEvent(db, makeEvent({
      id: "evt-anon",
      actor_provider_id: null,
      actor_identity_state: "anonymous_aggregate",
      is_anonymous_aggregate: true,
      content_ref: "product camera",
    }));

    expect(result.status).toBe("skipped_anonymous");
    expect(db._tables.social_interest_memory.length).toBe(0);
    expect(db._tables.social_interest_evidence.length).toBe(0);
  });

  it("same actor/value in different workspaces stays isolated", async () => {
    const db = makeInMemoryDb();

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-ws-a", workspace_id: "ws-A", actor_provider_id: "same-actor", content_ref: "product camera" }));
    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-ws-b", workspace_id: "ws-B", actor_provider_id: "same-actor", content_ref: "product camera" }));

    const a = db._tables.social_interest_memory.filter((m) => m.workspace_id === "ws-A");
    const b = db._tables.social_interest_memory.filter((m) => m.workspace_id === "ws-B");

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a[0].workspace_id).toBe("ws-A");
    expect(b[0].workspace_id).toBe("ws-B");
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("revoked identity link blocks future known_person attribution", async () => {
    const db = makeInMemoryDb();

    const link = await createVerifiedLink({
      workspace_id: "ws-A",
      provider: "meta_ig",
      provider_scope: "page-1",
      actor_provider_id: "actor-rev",
      evidence,
      db,
    });

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-before-revoke", actor_provider_id: "actor-rev", content_ref: "service cleanup" }));

    await revokeIdentityLink({ workspace_id: "ws-A", link_id: link.identity_link_id, reason: "test revoke", db });

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-after-revoke", actor_provider_id: "actor-rev", content_ref: "service cleanup" }));

    const knownRows = db._tables.social_interest_memory.filter((m) => m.actor_provider_id === "actor-rev" && m.actor_identity_state === "known_person" && m.state === "active");
    const actorRows = db._tables.social_interest_memory.filter((m) => m.actor_provider_id === "actor-rev" && m.actor_identity_state === "platform_actor" && m.state === "active");

    expect(knownRows.length).toBe(0);
    expect(actorRows.length).toBeGreaterThan(0);
  });

  it("ambiguous identity fails closed", async () => {
    const db = makeInMemoryDb();

    db._tables.identity_nodes.push({
      id: "node-amb",
      workspace_id: "ws-A",
      node_type: "provider_actor",
      provider: "meta_ig",
      provider_scope: "page-1",
      external_id: "actor-amb",
      normalized_value: "actor-amb",
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    db._tables.canonical_persons.push(
      { id: "person-1", workspace_id: "ws-A", created_at: nowIso(), updated_at: nowIso() },
      { id: "person-2", workspace_id: "ws-A", created_at: nowIso(), updated_at: nowIso() },
    );

    db._tables.identity_links.push(
      {
        id: "link-1",
        workspace_id: "ws-A",
        canonical_person_id: "person-1",
        identity_node_id: "node-amb",
        linkage_type: "verified_email",
        verified_identifier: "a@example.com",
        source_system: "test",
        verification_timestamp: nowIso(),
        confidence: "deterministic",
        is_revoked: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      {
        id: "link-2",
        workspace_id: "ws-A",
        canonical_person_id: "person-2",
        identity_node_id: "node-amb",
        linkage_type: "verified_email",
        verified_identifier: "b@example.com",
        source_system: "test",
        verification_timestamp: nowIso(),
        confidence: "deterministic",
        is_revoked: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    );

    const result = await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-amb", actor_provider_id: "actor-amb", content_ref: "product laptop" }));

    expect(result.status).toBe("skipped_ambiguous");
    expect(db._tables.social_interest_memory.length).toBe(0);
  });

  it("does not mutate journey/intent score state", async () => {
    const db = makeInMemoryDb();

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-safe-1", content_ref: "service warranty" }));

    expect(db._tables.customer_journey.length).toBe(0);
    expect(db._tables.journey_transitions.length).toBe(0);
  });

  it("does not execute NBA/action state", async () => {
    const db = makeInMemoryDb();

    await processInterestFromEngagementEvent(db, makeEvent({ id: "evt-safe-2", content_ref: "product camera" }));

    expect(db._tables.nba_actions.length).toBe(0);
    expect(db._writes.every((w) => !w.startsWith("nba_actions"))).toBe(true);
  });
});
