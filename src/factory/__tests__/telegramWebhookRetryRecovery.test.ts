import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/telegram-webhook/index.ts"),
  "utf8",
);

describe("Telegram webhook retry recovery", () => {
  it("tracks the claimed workspace and idempotency key after ownership is established", () => {
    expect(source).toContain("let claimedWorkspaceId: string | null = null");
    expect(source).toContain("let claimedIdempotencyKey: string | null = null");
    expect(source).toContain("claimedWorkspaceId = workspaceId");
    expect(source).toContain("claimedIdempotencyKey = idempotencyKey");
  });

  it("releases a processing claim as failed when downstream processing throws", () => {
    expect(source).toContain('event_message: "Telegram processing failure"');
    expect(source).toContain('.eq("workspace_id", claimedWorkspaceId)');
    expect(source).toContain('.eq("idempotency_key", claimedIdempotencyKey)');
    expect(source).toContain('.eq("status", "processing")');
  });

  it("preserves failed-claim reclaim semantics for provider retries", () => {
    expect(source).toContain('existingClaim?.status === "failed"');
    expect(source).toContain('.update({ status: "processing" })');
    expect(source).toContain('.eq("status", "failed")');
  });

  it("does not silently accept an inbox persistence failure", () => {
    expect(source).toContain("const { error: inboxError } = await supabase.from(\"inbox_messages\").insert");
    expect(source).toContain("if (inboxError) throw inboxError");
  });
});
