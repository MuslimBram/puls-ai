import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * FAZA 0 / D14 — behavioural suite for process-manual-payment.
 *
 * These tests execute the REAL edge-function source. The three Deno/npm imports
 * are swapped for stubs, the file is transpiled with esbuild and evaluated, and
 * the captured handler is driven with real Request objects.
 *
 * The mock query builder below is a thenable that implements `then` ONLY and
 * deliberately has NO `.catch` — exactly like PostgrestBuilder in
 * @supabase/supabase-js@2.57.2. That is the whole point: if anyone reintroduces
 * `.catch()` on a query chain, these tests throw a TypeError instead of quietly
 * passing, which is precisely how the v42 defect escaped review.
 */

const FN_PATH = "supabase/functions/process-manual-payment/index.ts";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

interface Db {
  tables: Tables;
  /** inject a failure, keyed "<table>:<op>" e.g. "billing_history:insert" */
  fail: Record<string, string>;
  ops: string[];
}

let uid = 0;
const nextId = () => `id-${++uid}`;

function makeDb(overrides: Partial<Tables> = {}): Db {
  return {
    tables: {
      manual_payments: [],
      billing_history: [],
      subscriptions: [],
      business_notifications: [],
      user_roles: [],
      payment_method_config: [],
      ...overrides,
    },
    fail: {},
    ops: [],
  };
}

function matches(row: Row, filters: any[][]): boolean {
  return filters.every(([kind, col, val]) => {
    if (kind === "eq") return row[col] === val;
    if (kind === "in") return (val as any[]).includes(row[col]);
    return true;
  });
}

function makeBuilder(db: Db, table: string, op: string, payload?: any) {
  const filters: any[][] = [];
  let single: "one" | "maybe" | null = null;

  const exec = () => {
    const key = `${table}:${op}`;
    db.ops.push(key);
    if (db.fail[key]) return { data: null, error: { message: db.fail[key] } };

    const rows = db.tables[table] ?? (db.tables[table] = []);

    if (op === "insert") {
      const inserted = { id: nextId(), ...payload };
      rows.push(inserted);
      return { data: single ? inserted : [inserted], error: null };
    }
    if (op === "upsert") {
      const idx = rows.findIndex((r) => r.user_id === payload.user_id);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...payload };
      else rows.push({ id: nextId(), ...payload });
      return { data: null, error: null };
    }
    if (op === "update") {
      const hit = rows.filter((r) => matches(r, filters));
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    // select
    const found = rows.filter((r) => matches(r, filters));
    if (single === "one") {
      if (found.length !== 1) return { data: null, error: { message: "no rows" } };
      return { data: found[0], error: null };
    }
    if (single === "maybe") return { data: found[0] ?? null, error: null };
    return { data: found, error: null };
  };

  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => (filters.push(["eq", c, v]), api),
    in: (c: string, v: any) => (filters.push(["in", c, v]), api),
    order: () => api,
    maybeSingle: () => ((single = "maybe"), api),
    single: () => ((single = "one"), api),
    // `then` ONLY. No `catch`, no `finally` — mirrors PostgrestBuilder.
    then: (onOk: any, onErr: any) => Promise.resolve(exec()).then(onOk, onErr),
  };
  return api;
}

function makeClient(db: Db, user: Row | null) {
  return {
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad token" } },
    },
    from: (table: string) => ({
      select: (...a: any[]) => makeBuilder(db, table, "select").select(...a),
      insert: (payload: any) => makeBuilder(db, table, "insert", payload),
      update: (payload: any) => makeBuilder(db, table, "update", payload),
      upsert: (payload: any) => makeBuilder(db, table, "upsert", payload),
    }),
  };
}

/** Transpile + evaluate the real source with stubbed imports; return the handler. */
async function loadHandler(): Promise<(req: Request) => Promise<Response>> {
  const raw = readFileSync(resolve(process.cwd(), FN_PATH), "utf8");
  const stubbed = raw
    .replace(/^import\s*\{\s*serve\s*\}\s*from\s*["'][^"']+["'];?\s*$/m, "const serve = globalThis.__serve;")
    .replace(
      /^import\s*\{\s*createClient\s*\}\s*from\s*["'][^"']+["'];?\s*$/m,
      "const createClient = (...a) => globalThis.__createClient(...a);",
    )
    .replace(
      /^import\s*\{\s*buildCorsHeaders\s*\}\s*from\s*["'][^"']+["'];?\s*$/m,
      "const buildCorsHeaders = (...a) => globalThis.__buildCorsHeaders(...a);",
    );

  // NOTE: the stubs MUST late-bind through globalThis. Binding by value at
  // eval time made every test use the PREVIOUS test's Supabase client, which
  // silently swapped the 401 and 403 expectations. Caught by T11/T12.
  // Guard: every import must have been stubbed, or the eval would fail opaquely.
  expect(stubbed).not.toMatch(/^import\s/m);

  // esbuild is invoked as a child process rather than through its JS API:
  // the API asserts `new TextEncoder().encode("") instanceof Uint8Array`, which
  // is false under jsdom, and this suite must run in the repo's default
  // environment so the shared test setup still applies.
  const esbuildBin = [
    "node_modules/vite/node_modules/esbuild/bin/esbuild",
    "node_modules/esbuild/bin/esbuild",
  ]
    .map((p) => resolve(process.cwd(), p))
    .find((p) => existsSync(p));
  if (!esbuildBin) throw new Error("esbuild binary not found");

  const code = execFileSync(esbuildBin, ["--loader=ts", "--format=cjs"], {
    input: stubbed,
    encoding: "utf8",
  });

  let captured: any = null;
  (globalThis as any).__serve = (h: any) => (captured = h);
  (globalThis as any).__buildCorsHeaders = () => ({});
  (globalThis as any).Deno = { env: { get: () => "stub" } };

  // eslint-disable-next-line no-new-func
  new Function("exports", "module", "require", code)({}, { exports: {} }, () => ({}));
  if (!captured) throw new Error("handler was never registered");
  return captured;
}

const ADMIN = { id: "admin-1" };
const CUSTOMER_ID = "cust-1";

function submittedPayment(over: Row = {}): Row {
  return {
    id: "pay-1",
    reference_id: "REF-001",
    user_id: CUSTOMER_ID,
    status: "submitted",
    plan_key: "standard",
    package_type: "monthly",
    payment_method: "bank_transfer_ALL",
    charged_currency: "ALL",
    charged_amount: 9900,
    base_currency: "EUR",
    base_amount: 95.65,
    fx_rate_used: 103.5,
    ...over,
  };
}

function verifyReq(body: Row) {
  return new Request("https://x/functions/v1/process-manual-payment?action=admin_verify", {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

let handler: (req: Request) => Promise<Response>;
let db: Db;

beforeEach(async () => {
  handler = await loadHandler();
  db = makeDb();
});

/** Wire the client factory to this test's db + caller. */
function asCaller(user: Row | null) {
  (globalThis as any).__createClient = () => makeClient(db, user);
}

describe("FAZA 0 / D14 — approve path", () => {
  it("T1 writes the invoice, activates the plan, completes the payment and notifies", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.subscription_activated).toBe(true);
    expect(body.notification_sent).toBe(true);

    expect(db.tables.billing_history).toHaveLength(1);
    expect(db.tables.billing_history[0]).toMatchObject({
      reference_id: "REF-001",
      status: "completed",
      charged_amount: 9900,
      charged_currency: "ALL",
    });
    expect(db.tables.subscriptions[0]).toMatchObject({ payment_status: "paid", plan: "standard" });
    expect(db.tables.manual_payments[0].status).toBe("paid");
    expect(db.tables.manual_payments[0].billing_history_id).toBe(body.billing_history_id);
    expect(db.tables.business_notifications).toHaveLength(1);
  });

  it("T2 REGRESSION: an invoice failure must not leave an activated plan behind", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.fail["billing_history:insert"] = "db down";
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    expect(res.status).toBe(500);

    // This is the exact v42 failure mode, inverted.
    expect(db.tables.subscriptions).toHaveLength(0);
    expect(db.tables.manual_payments[0].status).toBe("submitted");
    expect(db.tables.billing_history).toHaveLength(0);
    expect(db.tables.business_notifications).toHaveLength(0);
  });

  it("T3 a retry after that failure converges to a complete, single-invoice result", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.fail["billing_history:insert"] = "db down";
    asCaller(ADMIN);

    await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    delete db.fail["billing_history:insert"];
    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));

    expect(res.status).toBe(200);
    expect(db.tables.billing_history).toHaveLength(1);
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.manual_payments[0].status).toBe("paid");
  });

  it("T4 a notification failure must NOT undo a completed payment", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.fail["business_notifications:insert"] = "smtp down";
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.notification_sent).toBe(false);
    expect(db.tables.manual_payments[0].status).toBe("paid");
    expect(db.tables.billing_history).toHaveLength(1);
  });

  it("T5 IDEMPOTENCY: approving twice never produces a second invoice", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    asCaller(ADMIN);

    const first = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    const second = await handler(verifyReq({ payment_id: "pay-1", approve: true }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ error: "Payment not in submitted status" });
    expect(db.tables.billing_history).toHaveLength(1);
    expect(db.tables.subscriptions).toHaveLength(1);
  });

  it("T6 an invoice already existing for the reference is reused, not duplicated", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.tables.billing_history.push({ id: "pre-existing", reference_id: "REF-001" });
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.billing_history_id).toBe("pre-existing");
    expect(db.tables.billing_history).toHaveLength(1);
    expect(db.ops).not.toContain("billing_history:insert");
  });

  it("T7 a subscription failure leaves the payment retryable, not half-completed", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.fail["subscriptions:upsert"] = "constraint violation";
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));

    expect(res.status).toBe(500);
    expect(db.tables.manual_payments[0].status).toBe("submitted");
    expect(db.tables.business_notifications).toHaveLength(0);
  });
});

describe("FAZA 0 / D14 — reject path", () => {
  it("T8 records the rejection and returns success", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: false, rejection_reason: "no funds" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: "rejected", notification_sent: true });
    expect(db.tables.manual_payments[0].status).toBe("rejected");
    expect(db.tables.manual_payments[0].rejection_reason).toBe("no funds");
  });

  it("T9 REGRESSION: a notification failure must not turn a recorded rejection into a 500", async () => {
    db.tables.manual_payments.push(submittedPayment());
    db.tables.user_roles.push({ user_id: ADMIN.id, role: "admin" });
    db.fail["business_notifications:insert"] = "smtp down";
    asCaller(ADMIN);

    const res = await handler(verifyReq({ payment_id: "pay-1", approve: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.notification_sent).toBe(false);
    expect(db.tables.manual_payments[0].status).toBe("rejected");
  });
});

describe("FAZA 0 / D14 — authorization", () => {
  it("T10 rejects a caller with no bearer token", async () => {
    asCaller(ADMIN);
    const res = await handler(
      new Request("https://x/?action=admin_verify", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
  });

  it("T11 rejects an invalid token", async () => {
    asCaller(null);
    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));
    expect(res.status).toBe(401);
  });

  it("T12 rejects a signed-in NON-admin and writes nothing", async () => {
    db.tables.manual_payments.push(submittedPayment());
    asCaller({ id: CUSTOMER_ID }); // the paying customer, no admin role
    const res = await handler(verifyReq({ payment_id: "pay-1", approve: true }));

    expect(res.status).toBe(403);
    expect(db.tables.billing_history).toHaveLength(0);
    expect(db.tables.subscriptions).toHaveLength(0);
    expect(db.tables.manual_payments[0].status).toBe("submitted");
  });
});
