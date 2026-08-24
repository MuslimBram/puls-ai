import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("WhatsApp Full E2E hardening", () => {
  it("scopes outbound sends to the active workspace and encrypted credential bag", () => {
    const src = read("supabase/functions/send-whatsapp/index.ts");
    expect(src).toContain('workspace_id is required');
    expect(src).toContain('is_workspace_member');
    expect(src).toContain('credentials_encrypted');
    expect(src).toContain('decryptIfNeeded');
    expect(src).toContain('.eq("workspace_id", workspace_id)');
    expect(src).not.toContain('const accessToken = settings.access_token');
  });

  it("validates WhatsApp only inside an authorized workspace", () => {
    const src = read("supabase/functions/validate-whatsapp-connection/index.ts");
    expect(src).toContain('workspace_id is required');
    expect(src).toContain('is_workspace_member');
    expect(src).toContain('credentials_encrypted');
    expect(src).toContain('decryptIfNeeded');
    expect(src).toContain('Authorization: `Bearer ${accessToken}`');
    expect(src).not.toContain('?access_token=${settings.access_token}');
  });

  it("passes the selected workspace from browser send and validation flows", () => {
    const send = read("src/hooks/useSendMessage.ts");
    const validate = read("src/components/channels/ValidateWhatsAppButton.tsx");
    expect(send).toContain('Select a workspace before sending a WhatsApp message.');
    expect(send).toContain('workspace_id: workspace.id');
    expect(validate).toContain('useWorkspace');
    expect(validate).toContain('workspace_id: workspace.id');
  });

  it("keeps inbound webhook signature and exact phone-number workspace resolution", () => {
    const webhook = read("supabase/functions/whatsapp-webhook/index.ts");
    expect(webhook).toContain('verifyMetaSignature');
    expect(webhook).toContain('WHATSAPP_APP_SECRET');
    expect(webhook).toContain('phone_number_id');
    expect(webhook).toContain('Ambiguous channel mapping');
    expect(webhook).toContain('processed_webhook_events');
  });
});
