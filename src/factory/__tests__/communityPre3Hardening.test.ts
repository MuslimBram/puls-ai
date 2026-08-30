import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260830183000_pre3_community_ingress_hardening.sql");
const helpers = read("supabase/functions/community-shared/helpers.ts");
const commentCreate = read("supabase/functions/community-comment-create/index.ts");
const messageCreate = read("supabase/functions/community-message-create/index.ts");
const scanImage = read("supabase/functions/community-scan-image/index.ts");
const commentUi = read("src/pages/lidhjet/LidhjetFeed.tsx");
const chatUi = read("src/components/lidhjet/InterestChatModal.tsx");
const scanUi = read("src/components/lidhjet/AiImageScanButton.tsx");

describe("P0.6 PRE3 Community ingress hardening", () => {
  it("adds canonical event ids, unique idempotency indexes, and closes direct comment/message writes", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS event_id text");
    expect(migration).toContain("idx_community_comments_author_event");
    expect(migration).toContain("idx_community_interest_messages_sender_event");
    expect(migration).toContain("idx_community_violations_user_event");
    expect(migration).toContain("REVOKE INSERT, UPDATE ON TABLE public.community_comments FROM anon, authenticated");
    expect(migration).toContain("REVOKE INSERT, UPDATE ON TABLE public.community_interest_messages FROM anon, authenticated");
  });

  it("uses one deterministic pre-insert moderation helper for comments and chat messages", () => {
    expect(helpers).toContain("export function moderateCommunityText");
    expect(helpers).toContain("detectContactInformation(text)");
    expect(commentCreate).toContain("moderateCommunityText([{ field: \"content\", text: content }])");
    expect(messageCreate).toContain("moderateCommunityText([{ field: \"message\", text: message }])");

    expect(commentCreate.indexOf("const moderation = moderateCommunityText")).toBeLessThan(commentCreate.indexOf('.from("community_comments")\n      .insert'));
    expect(messageCreate.indexOf("const moderation = moderateCommunityText")).toBeLessThan(messageCreate.indexOf('.from("community_interest_messages")\n      .insert'));
  });

  it("deduplicates successful writes and blocked violation side effects by event id", () => {
    expect(commentCreate).toContain('.eq("event_id", eventId)');
    expect(messageCreate).toContain('.eq("event_id", eventId)');
    expect(commentCreate).toContain("event_id: eventId");
    expect(messageCreate).toContain("event_id: eventId");
    expect(commentCreate).toContain('commentError.code === "23505"');
    expect(messageCreate).toContain('msgError.code === "23505"');

    expect(commentUi).toContain("pendingCommentEventId.current");
    expect(commentUi).toContain("community_comment_${crypto.randomUUID()}");
    expect(commentUi).toContain("event_id: eventId");
    expect(chatUi).toContain("pendingEventId.current");
    expect(chatUi).toContain("community_msg_${crypto.randomUUID()}");
    expect(chatUi).toContain("event_id: eventId");
  });

  it("persists and reuses the real image classifier verdict instead of fabricating clean", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS result_json jsonb");
    expect(scanImage).toContain("function parseRouterScanResult");
    expect(scanImage).toContain("scanResult = parseRouterScanResult(routerData)");
    expect(scanImage).toContain("result_json: scanResult");
    expect(scanImage).toContain('.select("result_json")');
    expect(scanImage).toContain("PERSISTED_VERDICT_MISSING");

    const liveRouterBlock = scanImage.slice(
      scanImage.indexOf("if (mockMode)"),
      scanImage.indexOf("const { data: completedUsage"),
    );
    expect(liveRouterBlock).not.toContain('scanResult = { safe: true, label: "clean"');

    expect(scanImage).toContain("const { data: completedUsage, error: completeError }");
    expect(scanImage).toContain('.eq("status", "reserved")\n        .select("id")\n        .maybeSingle()');
    expect(scanImage).toContain("if (completeError || !completedUsage)");
  });

  it("never renders an unsafe classifier result as a safe badge", () => {
    expect(scanUi).toContain("if (!scanResult.safe)");
    expect(scanUi).toContain("Flagged:");
    expect(scanUi).toContain("ShieldAlert");
    expect(scanUi).toContain("requestIdRef.current");
  });
});
