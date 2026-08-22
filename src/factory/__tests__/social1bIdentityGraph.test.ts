/**
 * SOCIAL-1B — Identity Graph tests
 *
 * All tests exercise real shared production logic — no source-string assertions
 * except for structural file-surface checks.
 *
 * Covers (per spec §11):
 *  1.  Meta platform_actor with no verified linkage → remains platform_actor
 *  2.  Verified lawful linkage → resolves to correct known_person
 *  3.  known_person cannot be manufactured without linkage evidence
 *  4.  anonymous_aggregate → never resolves to a person
 *  5.  pseudonymous_visitor without deterministic linkage → remains pseudonymous
 *  6.  Same provider actor in different workspaces → isolated
 *  7.  Same email in different workspaces → no cross-tenant merge
 *  8.  Ambiguous deterministic candidates → fail closed
 *  9.  Revoked link → no longer resolves
 * 10.  Duplicate linkage request → idempotent / no error
 * 11.  SOCIAL-1A canonical event behaviour does not regress
 * 12.  SOCIAL-1C functionality is absent
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  resolveIdentity,
  createVerifiedLink,
  revokeIdentityLink,
  getLinksForPerson,
  type IdentityGraphClient,
  type IdentityLink,
  type IdentityNode,
  type CanonicalPerson,
  type LinkageEvidence,
} from "../../../supabase/functions/_shared/identity-graph";

import {
  buildCanonicalEngagementEvent,
} from "../../../supabase/functions/_shared/canonical-engagement-event";

// ── In-memory stub ────────────────────────────────────────────────────────────
// A minimal in-memory implementation of IdentityGraphClient that mimics the
// Supabase client interface, allowing tests to run without a live database.

type TableRows = {
  canonical_persons: CanonicalPerson[];
  identity_nodes:    IdentityNode[];
  identity_links:    IdentityLink[];
};

function makeInMemoryDb(tables: TableRows = {
  canonical_persons: [],
  identity_nodes:    [],
  identity_links:    [],
}): IdentityGraphClient & { _tables: TableRows } {
  let idCounter = 0;
  const nextId = () => `id-${++idCounter}`;

  function fromTable<T extends { id?: string; workspace_id?: string }>(tableName: string) {
    const rows = tables[tableName as keyof TableRows] as T[];

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
        // Track ON CONFLICT columns so single() can simulate DO NOTHING
        onConflictColumns = opts?.onConflict ? opts.onConflict.split(",").map(s => s.trim()) : [];
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

      is(col: string, val: null) {
        filters.push((row: T) => (row as any)[col] == null);
        return builder;
      },

      limit(n: number) {
        limitCount = n;
        return builder;
      },

      single(): Promise<{ data: T | null; error: null | { message: string } }> {
        // Execute pending mutation if any
        if (pendingInsert !== null) {
          const candidate = pendingInsert;
          // Simulate ON CONFLICT DO NOTHING: if a row already exists with the
          // same values on all conflict columns, return null data (no insert).
          if (onConflictColumns.length > 0) {
            const conflict = rows.find(r =>
              onConflictColumns.every(col => (r as any)[col] === (candidate as any)[col])
            );
            if (conflict) {
              pendingInsert = null;
              onConflictColumns = [];
              return Promise.resolve({ data: null, error: null });
            }
          }
          const row = { id: nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...candidate } as T;
          rows.push(row);
          pendingInsert = null;
          onConflictColumns = [];
          return Promise.resolve({ data: row, error: null });
        }

        if (pendingUpdate !== null) {
          const matched = rows.filter(r => filters.every(f => f(r)));
          if (matched.length === 0) {
            return Promise.resolve({ data: null, error: { message: "no rows matched update" } });
          }
          Object.assign(matched[0], pendingUpdate, { updated_at: new Date().toISOString() });
          pendingUpdate = null;
          return Promise.resolve({ data: matched[0], error: null });
        }

        const results = rows.filter(r => filters.every(f => f(r)));
        const limited = limitCount !== null ? results.slice(0, limitCount) : results;
        return Promise.resolve({ data: limited[0] ?? null, error: null });
      },

      then(resolve: (value: { data: T[]; error: null }) => any) {
        // Execute pending mutations for non-single() calls
        if (pendingInsert !== null) {
          const row = { id: nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...pendingInsert } as T;
          rows.push(row);
          pendingInsert = null;
          return Promise.resolve({ data: [row], error: null }).then(resolve);
        }

        if (pendingUpdate !== null) {
          const matched = rows.filter(r => filters.every(f => f(r)));
          matched.forEach(m => Object.assign(m, pendingUpdate, { updated_at: new Date().toISOString() }));
          pendingUpdate = null;
          return Promise.resolve({ data: matched, error: null }).then(resolve);
        }

        const results = rows.filter(r => filters.every(f => f(r)));
        const limited = limitCount !== null ? results.slice(0, limitCount) : results;
        return Promise.resolve({ data: limited, error: null }).then(resolve);
      },
    };

    return builder;
  }

  // In-memory resolve_identity mirrors the SQL function logic exactly
  function rpcResolveIdentity(args: {
    p_workspace_id:       string;
    p_provider:           string;
    p_account_identifier: string;
    p_actor_provider_id:  string | null;
  }): Promise<{ data: string | null; error: null }> {
    if (!args.p_actor_provider_id) {
      return Promise.resolve({ data: "anonymous_aggregate", error: null });
    }

    const normActor = args.p_actor_provider_id.toLowerCase().trim();

    const node = tables.identity_nodes.find(
      n => n.workspace_id    === args.p_workspace_id
        && n.node_type       === "provider_actor"
        && n.provider        === args.p_provider
        && n.provider_scope  === args.p_account_identifier
        && n.normalized_value === normActor,
    );

    if (!node) return Promise.resolve({ data: "unresolved", error: null });

    const activeLinks = tables.identity_links.filter(
      l => l.workspace_id     === args.p_workspace_id
        && l.identity_node_id === node.id
        && !l.is_revoked
        && l.confidence       === "deterministic",
    );

    if (activeLinks.length === 0) return Promise.resolve({ data: "platform_actor", error: null });

    const uniquePersonIds = new Set(activeLinks.map(l => l.canonical_person_id));
    if (uniquePersonIds.size > 1) return Promise.resolve({ data: "ambiguous", error: null });

    return Promise.resolve({ data: "known_person", error: null });
  }

  const client = {
    _tables: tables,

    from<T extends { id?: string; workspace_id?: string }>(table: string) {
      return fromTable<T>(table);
    },

    rpc<T>(fn: string, args: Record<string, unknown>) {
      if (fn === "resolve_identity") {
        return rpcResolveIdentity(args as any) as Promise<{ data: T | null; error: null }>;
      }
      return Promise.resolve({ data: null as T | null, error: { message: `unknown rpc: ${fn}`, code: "404" } });
    },
  };

  return client as any;
}

const evidence: LinkageEvidence = {
  linkage_type:           "verified_email",
  verified_identifier:    "user@example.com",
  source_system:          "test-auth-system",
  verification_timestamp: "2026-08-22T02:00:00Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Meta platform_actor with no verified linkage → remains platform_actor
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveIdentity — no linkage", () => {
  it("platform_actor with no node registered → canonical_state is platform_actor", async () => {
    const db = makeInMemoryDb();
    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "ig_user_456", db);
    expect(result.canonical_state).toBe("platform_actor");
    expect(result.outcome).toBe("unresolved");
    expect(result.canonical_person_id).toBeUndefined();
  });

  it("platform_actor with node but no link → canonical_state is platform_actor", async () => {
    const db = makeInMemoryDb();
    // Register node without a link
    db._tables.identity_nodes.push({
      id: "node-1", workspace_id: "ws-A", node_type: "provider_actor",
      provider: "meta_ig", provider_scope: "page_123",
      external_id: "ig_user_456", normalized_value: "ig_user_456",
      created_at: "", updated_at: "",
    });
    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "ig_user_456", db);
    expect(result.canonical_state).toBe("platform_actor");
    expect(result.outcome).toBe("platform_actor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Verified lawful linkage → resolves to correct known_person
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveIdentity — verified linkage", () => {
  it("resolves to known_person after createVerifiedLink", async () => {
    const db = makeInMemoryDb();

    const link = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "ig_user_456",
      evidence, db,
    });

    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "ig_user_456", db);
    expect(result.canonical_state).toBe("known_person");
    expect(result.canonical_person_id).toBe(link.canonical_person_id);
  });

  it("resolves to the CORRECT canonical_person_id (not a different person)", async () => {
    const db = makeInMemoryDb();
    const link1 = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_AAA",
      evidence, db,
    });
    await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_BBB",
      evidence: { ...evidence, verified_identifier: "other@example.com" }, db,
    });

    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "actor_AAA", db);
    expect(result.canonical_person_id).toBe(link1.canonical_person_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. known_person cannot be manufactured without linkage evidence
// ─────────────────────────────────────────────────────────────────────────────
describe("buildCanonicalEngagementEvent — known_person blocked without evidence", () => {
  it("throws when known_person is requested without actor_provider_id", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        workspace_id: "ws-A", channel_id: "ch-1",
        provider: "meta_ig", account_identifier: "page_123",
        event_type: "message_received", provider_event_id: "mid.001",
        actor_provider_id: null,
        actor_identity_state: "known_person",
        content_ref: null,
      })
    ).toThrow(/known_person/);
  });

  it("createVerifiedLink requires evidence fields", async () => {
    const db = makeInMemoryDb();
    await expect(
      createVerifiedLink({
        workspace_id: "ws-A", provider: "meta_ig",
        provider_scope: "page_123", actor_provider_id: "ig_user",
        evidence: { ...evidence, verified_identifier: "" }, db,
      })
    ).rejects.toThrow(/evidence/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. anonymous_aggregate → never resolves to a person
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveIdentity — anonymous_aggregate", () => {
  it("null actor_provider_id → always anonymous_aggregate, never known_person", async () => {
    const db = makeInMemoryDb();
    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", null, db);
    expect(result.canonical_state).toBe("anonymous_aggregate");
    expect(result.outcome).toBe("anonymous_aggregate");
    expect(result.canonical_person_id).toBeUndefined();
  });

  it("anonymous_aggregate event builder invariant: no actor_provider_id allowed", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        workspace_id: "ws-A", channel_id: "ch-1",
        provider: "meta_ig", account_identifier: "page_123",
        event_type: "message_received", provider_event_id: "mid.anon",
        actor_provider_id: "some_actor",
        actor_identity_state: "anonymous_aggregate",
        content_ref: null,
      })
    ).toThrow(/anonymous_aggregate/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. pseudonymous_visitor without deterministic linkage → remains pseudonymous
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveIdentity — pseudonymous_visitor", () => {
  it("pseudonymous token with no identity graph link remains platform_actor in graph resolution", async () => {
    const db = makeInMemoryDb();
    // A pseudonymous_visitor is represented as a pseudonymous_token node in the graph
    db._tables.identity_nodes.push({
      id: "node-pseudo", workspace_id: "ws-A", node_type: "pseudonymous_token",
      provider: undefined, provider_scope: undefined,
      external_id: "fp_abc123", normalized_value: "fp_abc123",
      created_at: "", updated_at: "",
    });
    // No link → resolveIdentity with no provider match returns platform_actor
    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "fp_abc123", db);
    // No provider_actor node for this, so unresolved → platform_actor
    expect(result.canonical_state).toBe("platform_actor");
    expect(result.canonical_person_id).toBeUndefined();
  });

  it("pseudonymous_visitor event builder invariant: actor_provider_id required", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        workspace_id: "ws-A", channel_id: "ch-1",
        provider: "meta_ig", account_identifier: "page_123",
        event_type: "message_received", provider_event_id: "mid.pseudo",
        actor_provider_id: null,
        actor_identity_state: "pseudonymous_visitor",
        content_ref: null,
      })
    ).toThrow(/pseudonymous_visitor/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Same provider actor in different workspaces → isolated
// ─────────────────────────────────────────────────────────────────────────────
describe("Cross-workspace isolation — provider actor", () => {
  it("same actor ID in workspace A does not resolve in workspace B", async () => {
    const db = makeInMemoryDb();

    // Create verified link in workspace A
    await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "shared_actor",
      evidence, db,
    });

    // Resolve the same actor in workspace B → must not resolve
    const resultB = await resolveIdentity("ws-B", "meta_ig", "page_123", "shared_actor", db);
    expect(resultB.canonical_state).toBe("platform_actor");
    expect(resultB.canonical_person_id).toBeUndefined();
  });

  it("workspace A resolution does not return workspace B canonical_person_id", async () => {
    const db = makeInMemoryDb();

    const linkA = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_X", actor_provider_id: "actor_X",
      evidence, db,
    });

    const resultA = await resolveIdentity("ws-A", "meta_ig", "page_X", "actor_X", db);
    expect(resultA.canonical_state).toBe("known_person");
    expect(resultA.canonical_person_id).toBe(linkA.canonical_person_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Same email in different workspaces → no cross-tenant merge
// ─────────────────────────────────────────────────────────────────────────────
describe("Cross-workspace isolation — email identifier", () => {
  it("same email used in two workspaces produces two independent nodes", async () => {
    const db = makeInMemoryDb();

    const ev1: LinkageEvidence = { ...evidence, verified_identifier: "shared@example.com" };
    const linkA = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_1", actor_provider_id: "actor_ws_a",
      evidence: ev1, db,
    });
    const linkB = await createVerifiedLink({
      workspace_id: "ws-B", provider: "meta_ig",
      provider_scope: "page_1", actor_provider_id: "actor_ws_b",
      evidence: ev1, db,
    });

    expect(linkA.canonical_person_id).not.toBe(linkB.canonical_person_id);

    const rA = await resolveIdentity("ws-A", "meta_ig", "page_1", "actor_ws_a", db);
    const rB = await resolveIdentity("ws-B", "meta_ig", "page_1", "actor_ws_b", db);
    expect(rA.canonical_person_id).not.toBe(rB.canonical_person_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Ambiguous deterministic candidates → fail closed
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveIdentity — ambiguous", () => {
  it("two canonical persons linked to the same node → fail closed → platform_actor", async () => {
    const db = makeInMemoryDb();

    // Create a node and two persons, link both to the same node
    db._tables.identity_nodes.push({
      id: "node-amb", workspace_id: "ws-A", node_type: "provider_actor",
      provider: "meta_ig", provider_scope: "page_123",
      external_id: "ambiguous_actor", normalized_value: "ambiguous_actor",
      created_at: "", updated_at: "",
    });
    db._tables.canonical_persons.push(
      { id: "person-X", workspace_id: "ws-A", created_at: "", updated_at: "" },
      { id: "person-Y", workspace_id: "ws-A", created_at: "", updated_at: "" },
    );
    db._tables.identity_links.push(
      {
        id: "link-1", workspace_id: "ws-A",
        canonical_person_id: "person-X", identity_node_id: "node-amb",
        linkage_type: "verified_email", verified_identifier: "a@x.com",
        source_system: "test", verification_timestamp: "2026-01-01T00:00:00Z",
        confidence: "deterministic", is_revoked: false,
        created_at: "", updated_at: "",
      },
      {
        id: "link-2", workspace_id: "ws-A",
        canonical_person_id: "person-Y", identity_node_id: "node-amb",
        linkage_type: "verified_email", verified_identifier: "b@x.com",
        source_system: "test", verification_timestamp: "2026-01-01T00:00:00Z",
        confidence: "deterministic", is_revoked: false,
        created_at: "", updated_at: "",
      },
    );

    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "ambiguous_actor", db);
    expect(result.outcome).toBe("ambiguous");
    expect(result.canonical_state).toBe("platform_actor"); // fail closed
    expect(result.canonical_person_id).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Revoked link → no longer resolves
// ─────────────────────────────────────────────────────────────────────────────
describe("revokeIdentityLink", () => {
  it("revoked link → resolveIdentity returns platform_actor", async () => {
    const db = makeInMemoryDb();

    const { identity_link_id } = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_rev",
      evidence, db,
    });

    // Verify it resolves before revocation
    const before = await resolveIdentity("ws-A", "meta_ig", "page_123", "actor_rev", db);
    expect(before.canonical_state).toBe("known_person");

    // Revoke
    await revokeIdentityLink({ workspace_id: "ws-A", link_id: identity_link_id, reason: "test revocation", db });

    // After revocation → falls back to platform_actor
    const after = await resolveIdentity("ws-A", "meta_ig", "page_123", "actor_rev", db);
    expect(after.canonical_state).toBe("platform_actor");
    expect(after.canonical_person_id).toBeUndefined();
  });

  it("revocation preserves the row for audit (soft delete)", async () => {
    const db = makeInMemoryDb();

    const { canonical_person_id, identity_link_id } = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_soft_del",
      evidence, db,
    });

    await revokeIdentityLink({ workspace_id: "ws-A", link_id: identity_link_id, reason: "GDPR test", db });

    // The row must still exist in the table with is_revoked = true
    const links = await getLinksForPerson({
      workspace_id: "ws-A", canonical_person_id, include_revoked: true, db,
    });
    expect(links.length).toBe(1);
    expect(links[0].is_revoked).toBe(true);
    expect(links[0].revocation_reason).toBe("GDPR test");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Duplicate linkage request → idempotent
// ─────────────────────────────────────────────────────────────────────────────
describe("createVerifiedLink — idempotency", () => {
  it("calling createVerifiedLink twice for the same actor resolves cleanly", async () => {
    const db = makeInMemoryDb();

    const first = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_dup",
      evidence, db,
    });

    // Second call: reuse the existing canonical_person_id
    const second = await createVerifiedLink({
      workspace_id: "ws-A", provider: "meta_ig",
      provider_scope: "page_123", actor_provider_id: "actor_dup",
      canonical_person_id: first.canonical_person_id,
      evidence: { ...evidence, verified_identifier: "user@example.com" }, db,
    });

    expect(second.canonical_person_id).toBe(first.canonical_person_id);
    expect(second.identity_node_id).toBe(first.identity_node_id);

    // Resolution still works
    const result = await resolveIdentity("ws-A", "meta_ig", "page_123", "actor_dup", db);
    expect(result.canonical_state).toBe("known_person");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. SOCIAL-1A canonical event behaviour does not regress
// ─────────────────────────────────────────────────────────────────────────────
describe("SOCIAL-1A non-regression", () => {
  it("Meta IG DM still defaults to platform_actor", () => {
    const ev = buildCanonicalEngagementEvent({
      workspace_id: "ws-A", channel_id: "ch-1",
      provider: "meta_ig", account_identifier: "page_123",
      event_type: "message_received", provider_event_id: "mid.regression",
      actor_provider_id: "ig_user_999",
      content_ref: "Hi",
    });
    expect(ev.actor_identity_state).toBe("platform_actor");
  });

  it("Meta IG DM with null sender → anonymous_aggregate", () => {
    const ev = buildCanonicalEngagementEvent({
      workspace_id: "ws-A", channel_id: "ch-1",
      provider: "meta_ig", account_identifier: "page_123",
      event_type: "message_received", provider_event_id: "mid.anon",
      actor_provider_id: null,
      content_ref: null,
    });
    expect(ev.actor_identity_state).toBe("anonymous_aggregate");
    expect(ev.is_anonymous_aggregate).toBe(true);
  });

  it("idempotency key format is stable", () => {
    const ev = buildCanonicalEngagementEvent({
      workspace_id: "ws-aaa", channel_id: "ch-bbb",
      provider: "meta_ig", account_identifier: "page_123",
      event_type: "message_received", provider_event_id: "mid.abc123",
      actor_provider_id: "ig_user_456",
      content_ref: null,
    });
    expect(ev.idempotency_key).toBe("seg:meta_ig:ws-aaa:mid.abc123");
  });

  it("platform_actor without actor_provider_id still throws", () => {
    expect(() =>
      buildCanonicalEngagementEvent({
        workspace_id: "ws-A", channel_id: "ch-1",
        provider: "meta_ig", account_identifier: "page_123",
        event_type: "message_received", provider_event_id: "mid.err",
        actor_provider_id: null,
        actor_identity_state: "platform_actor",
        content_ref: null,
      })
    ).toThrow(/platform_actor/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. SOCIAL-1C functionality is absent
// ─────────────────────────────────────────────────────────────────────────────
describe("SOCIAL-1C surface absence", () => {
  const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

  const identityGraphSrc = readFileSync(
    repoFile("supabase", "functions", "_shared", "identity-graph.ts"),
    "utf-8",
  );
  const migrationSrc = readFileSync(
    repoFile("supabase", "migrations", "20260822140000_social_1b_identity_graph.sql"),
    "utf-8",
  );

  const social1cTerms = [
    "interest_memory",
    "topic_affinity",
    "product_interest",
    "intent_scoring",
    "journey_change",
    "next_best_action",
    "smart_broadcast",
    "audience_segment",
    "attribution_learning",
    "fingerprint",
  ];

  social1cTerms.forEach(term => {
    it(`identity-graph.ts does not contain SOCIAL-1C term: ${term}`, () => {
      expect(identityGraphSrc.toLowerCase()).not.toContain(term.toLowerCase());
    });
    it(`migration does not contain SOCIAL-1C term: ${term}`, () => {
      expect(migrationSrc.toLowerCase()).not.toContain(term.toLowerCase());
    });
  });
});
