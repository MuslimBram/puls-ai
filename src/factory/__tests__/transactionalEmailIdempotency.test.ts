import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const source = read("supabase/functions/send-transactional-email/index.ts");
const migration = read(
  "supabase/migrations/20260829094000_transactional_email_active_dispatch_claim.sql",
);

describe("transactional email idempotency", () => {
  it("enforces one active pending/sent dispatch while preserving failed retries", () => {
    expect(migration).toContain(
      "status IN ('pending', 'sent')",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX idx_email_send_log_message_active_unique",
    );
    expect(migration).toContain("pending_log.status = 'pending'");
    expect(migration).toContain("sent_log.status = 'sent'");
    expect(migration).not.toContain("UNIQUE (message_id)");
  });

  it("uses the pending log insert as the atomic dispatch claim", () => {
    expect(source).toContain("const { data: dispatchClaim, error: pendingLogErr }");
    expect(source).toContain("pendingLogErr.code === '23505'");
    expect(source).toContain("duplicate: true");
    expect(source).toContain("const dispatchLogId = dispatchClaim.id");
  });

  it("fails closed on claim errors and updates only the claimed log row", () => {
    expect(source).toContain("Failed to claim transactional email dispatch");
    expect(source).toContain(".eq('id', dispatchLogId)");
    expect(source).not.toContain("Failed to insert pending log into email_send_log', pendingLogErr\n  }");
  });

  it("treats pending or sent rows as duplicate work before rendering/sending", () => {
    expect(source).toContain(".in('status', ['pending', 'sent'])");
    expect(source).toContain("Duplicate email dispatch blocked by idempotency check");
  });
});
