import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sms = readFileSync(resolve(process.cwd(), "supabase/functions/sms-webhook/index.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260830215500_sms_ingress_idempotency.sql"), "utf8");

describe("P0.6 SMS provider-id prerequisite", () => {
  it("requires Twilio's provider-native MessageSid and never invents a retry id", () => {
    expect(sms).toContain('messageSid = params.get("MessageSid") || params.get("SmsSid") || ""');
    expect(sms).toContain('if (!messageSid)');
    expect(sms).not.toContain("crypto.randomUUID()");
    expect(sms).not.toContain("Date.now()");
  });

  it("claims the provider event before normal inbound side effects", () => {
    const claim = sms.indexOf("const claim = await claimInboundEvent");
    const thread = sms.indexOf('supabase.rpc("upsert_conversation_thread"');
    const inbox = sms.indexOf('supabase.from("inbox_messages").insert');
    const lead = sms.indexOf('supabase.from("leads").insert');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(thread);
    expect(claim).toBeLessThan(inbox);
    expect(claim).toBeLessThan(lead);
    expect(sms).toContain('provider: "twilio_sms"');
    expect(sms).toContain('event_id: `twilio_sms:${messageSid}`');
  });

  it("uses the signed provider-owned number mapping without a second global channel search", () => {
    expect(sms).toContain("const workspaceId = wsCreds.workspace_id");
    expect(sms).toContain("const userId = wsCreds.user_id");
    expect(sms).toContain("const channelId = wsCreds.channel_id");
    expect(sms).not.toContain('.from("channels")');
  });

  it("binds keyword lookup and Inbox writes to the resolved workspace", () => {
    expect(sms).toContain('.eq("workspace_id", workspaceId)');
    expect(sms).not.toContain('.eq("user_id", userId)\n      .eq("is_active", true)');
    expect(sms).toContain("workspace_id: workspaceId");
    expect(sms).toContain("provider_message_id: messageSid");
  });

  it("releases claims and returns a retryable error on critical persistence failures", () => {
    expect(sms).toContain("await releaseInboundEvent(supabase, claimedWorkspaceId, claimedMessageSid)");
    expect(sms).toContain('status: 500');
    expect(sms).toContain('inboxErr.code === "23505"');
  });

  it("adds a race-safe SMS-only Inbox uniqueness boundary", () => {
    expect(migration).toContain("inbox_messages_sms_event_unique");
    expect(migration).toContain("(workspace_id, provider_message_id)");
    expect(migration).toContain("channel_type = 'sms'");
    expect(migration).toContain("HAVING count(*) > 1");
  });
});
