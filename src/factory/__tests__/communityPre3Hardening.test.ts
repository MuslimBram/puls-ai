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
    expect(migration).toContain("idx_community_notifications_user_type_event");
    expect(migration).toContain("REVOKE INSERT, UPDATE ON TABLE public.community_comments FROM anon, authenticated");
    expect(migration).toContain("REVOKE INSERT, UPDATE ON TABLE public.community_interest_messages FROM anon, authenticated");
  });

  it("uses the canonical service-key resolver for Community admin clients", () => {
    expect(helpers).toContain('import { getServiceKey } from "../_shared/admin-client.ts"');
    expect(helpers).toContain("const supabaseServiceKey = getServiceKey()");
    expect(helpers).not.toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
  });

  it("requires caller-generated event ids so retries preserve the same idempotency key", () => {
    expect(helpers).toContain('return { ok: false, message: "event_id is required for idempotent community writes" }');
    expect(helpers).not.toContain("crypto.randomUUID()");
    expect(commentCreate).toContain("parseCommunityEventId(event_id)");
    expect(messageCreate).toContain("parseCommunityEventId(event_id)");
    expect(commentUi).toContain("community_comment_${crypto.randomUUID()}");
    expect(chatUi).toContain("community_msg_${crypto.randomUUID()}");
  });

  it("uses one deterministic pre-insert moderation helper for comments and chat messages", () => {
    expect(helpers).toContain("export function moderateCommunityText");
    expect(helpers).toContain("detectContactInformation(text)");
    expect(commentCreate).toContain('moderateCommunityText([{ field: "content", text: commentContent }])');
    expect(messageCreate).toContain('moderateCommunityText([{ field: "message", text: messageContent }])');

    expect(commentCreate.indexOf("const moderation = moderateCommunityText")).toBeLessThan(commentCreate.indexOf('.from("community_comments")\n      .insert'));
    expect(messageCreate.indexOf("const moderation = moderateCommunityText")).toBeLessThan(messageCreate.indexOf('.from("community_interest_messages")\n      .insert'));
  });

  it("binds each event id to one immutable comment/message payload", () => {
    expect(commentCreate).toContain("EVENT_ID_PAYLOAD_MISMATCH");
    expect(messageCreate).toContain("EVENT_ID_PAYLOAD_MISMATCH");

    const commentLookup = commentCreate.slice(
      commentCreate.indexOf("const { data: existingComment"),
      commentCreate.indexOf("if (existingComment)"),
    );
    expect(commentLookup).toContain('.eq("author_user_id", user.id)');
    expect(commentLookup).toContain('.eq("event_id", eventId)');
    expect(commentLookup).not.toContain('.eq("post_id"');

    const messageLookup = messageCreate.slice(
      messageCreate.indexOf("const { data: existingMessage"),
      messageCreate.indexOf("if (existingMessage)"),
    );
    expect(messageLookup).toContain('.eq("sender_user_id", user.id)');
    expect(messageLookup).toContain('.eq("event_id", eventId)');
    expect(messageLookup).not.toContain('.eq("interest_id"');

    expect(commentCreate).toContain("existingComment.post_id === postId");
    expect(commentCreate).toContain("existingComment.content === commentContent");
    expect(messageCreate).toContain("existingMessage.interest_id !== interestId");
    expect(messageCreate).toContain("existingMessage.message !== messageContent");
  });

  it("deduplicates successful writes and blocked violation side effects by event id", () => {
    expect(commentCreate).toContain('.eq("event_id", eventId)');
    expect(messageCreate).toContain('.eq("event_id", eventId)');
    expect(commentCreate).toContain("event_id: eventId");
    expect(messageCreate).toContain("event_id: eventId");
    expect(commentCreate).toContain('commentError.code === "23505"');
    expect(messageCreate).toContain('msgError.code === "23505"');
    expect(commentCreate).toContain('existingViolation.violation_type === "contact_info_in_comment"');
    expect(messageCreate).toContain('existingViolation.violation_type === "contact_info_in_message"');
    expect(commentCreate).toContain('violationError.code !== "23505"');
    expect(messageCreate).toContain('violationError.code !== "23505"');

    expect(commentUi).toContain("pendingCommentEventId.current");
    expect(commentUi).toContain("community_comment_${crypto.randomUUID()}");
    expect(commentUi).toContain("event_id: eventId");
    expect(chatUi).toContain("pendingEventId.current");
    expect(chatUi).toContain("community_msg_${crypto.randomUUID()}");
    expect(chatUi).toContain("event_id: eventId");
  });

  it("makes new-message notification creation exactly-once and retry-repairable", () => {
    expect(messageCreate).toContain("async function ensureMessageNotification");
    expect(messageCreate).toContain('onConflict: "user_id,type,event_id"');
    expect(messageCreate).toContain("ignoreDuplicates: true");
    expect(messageCreate).toContain("event_id: eventId");
    expect(messageCreate).toContain("NOTIFICATION_PERSIST_FAILED");

    const existingPath = messageCreate.slice(
      messageCreate.indexOf("if (existingMessage)"),
      messageCreate.indexOf("const { data: existingViolation"),
    );
    expect(existingPath).toContain("ensureMessageNotification");

    const racedPath = messageCreate.slice(
      messageCreate.indexOf('if (msgError.code === "23505")'),
      messageCreate.indexOf('return errorResponse("Unable to create message"'),
    );
    expect(racedPath).toContain("ensureMessageNotification");
  });

  it("validates comment parent integrity before service-role insertion", () => {
    expect(commentCreate).toContain('.select("id, post_id")');
    expect(commentCreate).toContain("parentComment.post_id !== postId");
    expect(commentCreate).toContain("INVALID_PARENT_COMMENT");
    expect(commentCreate.indexOf("INVALID_PARENT_COMMENT")).toBeLessThan(commentCreate.indexOf('.from("community_comments")\n      .insert'));
  });

  it("does not propagate blocked phone/email values into moderation audit metadata", () => {
    const moderationBlock = helpers.slice(
      helpers.indexOf("export function moderateCommunityText"),
      helpers.indexOf("export function detectContactInformation"),
    );
    expect(moderationBlock).not.toContain("match: detection.match");
    expect(commentCreate).not.toContain("moderation.detection.match");
    expect(messageCreate).not.toContain("moderation.detection.match");
  });

  it("persists, fingerprints and validates the real image classifier verdict", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS result_json jsonb");
    expect(scanImage).toContain("function parseRouterScanResult");
    expect(scanImage).toContain("function validateScanResult");
    expect(scanImage).toContain("normalizePublicHttpsImageUrl");
    expect(scanImage).toContain("parseCommunityEventId(request_id)");
    expect(scanImage).toContain("input_sha256: inputHash");
    expect(scanImage).toContain("persisted.input_sha256 !== inputHash");
    expect(scanImage).toContain("PERSISTED_VERDICT_INVALID");
    expect(scanImage).toContain("EVENT_ID_PAYLOAD_MISMATCH");
    expect(scanImage).toContain("result_json: persistedResult");
    expect(scanImage).toContain('.select("result_json")');
    expect(scanImage).toContain("PERSISTED_VERDICT_MISSING");

    expect(scanImage).toContain('safe && normalizedLabel !== "clean"');
    expect(scanImage).toContain('!safe && normalizedLabel === "clean"');
    expect(scanImage).toContain('url.protocol !== "https:"');
    expect(scanImage).toContain("url.username || url.password");

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
