import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const sms = read("supabase/functions/sms-webhook/index.ts");
const whatsapp = read("supabase/functions/whatsapp-webhook/index.ts");
const email = read("supabase/functions/send-email/index.ts");
const twilioResolver = read("supabase/functions/_shared/twilio-workspace-resolver.ts");

const between = (source: string, startText: string, endText: string) => {
  const start = source.indexOf(startText);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endText, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("provider boundary hardening", () => {
  it("fails closed when a Twilio number maps to more than one enabled channel", () => {
    expect(twilioResolver).toContain("const matches = channels.filter");
    expect(twilioResolver).toContain("if (matches.length !== 1)");
    expect(twilioResolver).toContain("Ambiguous Twilio phone mapping");
  });

  it("binds SMS delivery callbacks to the signed provider-owned number and resolved workspace", () => {
    expect(sms).toContain("const isStatusCallback = Boolean(routingStatus && routingSid && !routingBody)");
    expect(sms).toContain("? (routingFrom || routingCalled || routingTo)");
    expect(sms).toContain("wsCreds?.decrypted_auth_token");

    const statusBlock = between(
      sms,
      "// ── STATUS CALLBACK (delivery reconciliation) ──",
      "// ── INBOUND MESSAGE ──",
    );
    expect(statusBlock).toContain('.eq("provider_message_id", messageSid)');
    expect(statusBlock).toContain('.eq("workspace_id", matchedChannel.workspace_id)');
    expect(statusBlock).not.toContain(".limit(100)");
  });

  it("scopes WhatsApp delivery updates to the uniquely resolved workspace", () => {
    const statusStart = whatsapp.indexOf("// Delivery status updates");
    expect(statusStart).toBeGreaterThanOrEqual(0);
    const inboundStart = whatsapp.indexOf("// Inbound messages", statusStart);
    expect(inboundStart).toBeGreaterThan(statusStart);
    const statusBlock = whatsapp.slice(statusStart, inboundStart);

    expect(statusBlock).toContain('.eq("provider_message_id", st.id)');
    expect(statusBlock).toContain('.eq("workspace_id", workspaceId)');
  });

  it("fails closed instead of choosing the first email channel for a multi-workspace user", () => {
    expect(email).toContain('.eq("channel_type", "email")');
    expect(email).toContain(".limit(2)");
    expect(email).toContain("if (channels.length !== 1)");
    expect(email).toContain(
      'throw new Error("Multiple enabled email channels found. Select a specific workspace/channel before sending.");',
    );
    expect(email).toContain("_workspace_id: channel.workspace_id");
  });
});
