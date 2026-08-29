import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/send-transactional-email/index.ts"),
  "utf8",
);

describe("transactional email idempotency", () => {
  it("passes a stable Idempotency-Key to Resend on every retry", () => {
    expect(source).toContain("idempotencyKey: string");
    expect(source).toContain("'Idempotency-Key': idempotencyKey");
    expect(source).toContain("sendViaResendWithRetry(resendApiKey, {");
    expect(source).toContain("}, idempotencyKey)");
  });

  it("uses a stable broadcast item id as the provider idempotency key", () => {
    expect(source).toContain("const providerIdempotencyKey = `broadcast/${item.id}`");
    expect(source).toContain("}, providerIdempotencyKey)");
  });

  it("does not use maybeSingle for the sent/pending duplicate preflight", () => {
    expect(source).toContain(".in('status', ['pending', 'sent'])");
    expect(source).toContain(".limit(1)");
    expect(source).toContain("const existingLog = existingLogs?.[0]");
  });

  it("fails closed if the idempotency preflight itself fails", () => {
    expect(source).toContain("Database failure during idempotency lookup");
    expect(source).toContain("duplicate: true");
  });
});
