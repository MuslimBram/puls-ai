import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const relay = readFileSync(
  resolve(process.cwd(), "supabase/functions/voice-ai-relay/index.ts"),
  "utf8",
);
const signatures = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/webhook-signatures.ts"),
  "utf8",
);
const inbound = readFileSync(
  resolve(process.cwd(), "supabase/functions/twilio-inbound-call/index.ts"),
  "utf8",
);
const twiml = readFileSync(
  resolve(process.cwd(), "supabase/functions/twilio-twiml/index.ts"),
  "utf8",
);

describe("Voice AI relay workspace boundary", () => {
  it("requires provider-owned called-number resolution before signature acceptance", () => {
    expect(relay).toContain("resolveWorkspaceFromCalledNumber(calledParam");
    expect(relay).toContain("if (!wsCreds)");
    expect(relay).toContain('return new Response("Forbidden: workspace not found", { status: 403 })');
    expect(relay).toContain("wsCreds.decrypted_auth_token");
    expect(relay).toContain("const workspaceId = wsCreds.workspace_id");
  });

  it("never accepts query-string workspace_id or a global Twilio fallback", () => {
    expect(relay).not.toContain('url.searchParams.get("workspace_id")');
    expect(relay).not.toContain('Deno.env.get("TWILIO_AUTH_TOKEN")');
    expect(relay).not.toContain("Using global fallback");
    expect(signatures).toContain("const workspaceScopedVerification = arguments.length >= 4");
    expect(signatures).toContain("workspace_auth_token_unavailable");
  });

  it("requires an enabled voice-AI channel in the resolved workspace", () => {
    expect(relay).toContain('.eq("workspace_id", workspaceId)');
    expect(relay).toContain('.eq("channel_type", "voip")');
    expect(relay).toContain('.eq("is_enabled", true)');
    expect(relay).toContain("if (!ch?.voice_ai_enabled)");
  });

  it("scopes session restore and every mutation by workspace as well as CallSid", () => {
    const callSidMatches = relay.match(/\.eq\("call_sid", callSid\)/g) ?? [];
    const workspaceMatches = relay.match(/\.eq\("workspace_id", workspaceId\)/g) ?? [];
    expect(callSidMatches.length).toBeGreaterThanOrEqual(4);
    expect(workspaceMatches.length).toBeGreaterThanOrEqual(5);
  });

  it("confirms fresh Voice E2E still needs explicit ConversationRelay wiring", () => {
    expect(inbound).not.toContain("ConversationRelay");
    expect(inbound).not.toContain("voice-ai-relay");
    expect(twiml).not.toContain("ConversationRelay");
    expect(twiml).not.toContain("voice-ai-relay");
  });
});
