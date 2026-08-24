import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const hook = read("src/hooks/useSendMessage.ts");
const send = read("supabase/functions/send-whatsapp/index.ts");
const validate = read("supabase/functions/validate-whatsapp-connection/index.ts");
const validatorUi = read("src/components/channels/ValidateWhatsAppButton.tsx");
const webhook = read("supabase/functions/whatsapp-webhook/index.ts");
const credentialWriter = read("supabase/functions/save-channel-credentials/index.ts");

describe("WhatsApp Cloud API E2E hardening", () => {
  it("sends and validates only inside the selected workspace", () => {
    expect(hook).toContain('Select a workspace before sending WhatsApp messages.');
    expect(hook).toContain('workspace_id: workspace.id');
    expect(validatorUi).toContain('workspace_id: workspace.id');
    expect(send).toContain('is_workspace_member');
    expect(send).toContain('.eq("workspace_id", workspace_id)');
    expect(validate).toContain('is_workspace_member');
    expect(validate).toContain('.eq("workspace_id", workspaceId)');
  });

  it("uses encrypted channel credentials server-side", () => {
    expect(credentialWriter).toContain('credentials_encrypted');
    expect(send).toContain('credentials_encrypted');
    expect(send).toContain('decryptIfNeeded');
    expect(validate).toContain('credentials_encrypted');
    expect(validate).toContain('decryptIfNeeded');
    expect(send).toContain('Authorization: `Bearer ${accessToken}`');
  });

  it("keeps routing identifiers non-secret for exact webhook workspace resolution", () => {
    expect(webhook).toContain('settings.phone_number_id');
    expect(webhook).toContain('s.phone_number_id === wabaPhone');
    expect(webhook).toContain('matches.length > 1');
    expect(webhook).toContain('verifyMetaSignature');
    expect(webhook).toContain('WHATSAPP_APP_SECRET');
  });

  it("does not put the token into a Graph URL or provider logs", () => {
    expect(send).not.toContain('?access_token=${accessToken}');
    expect(validate).not.toContain('?access_token=${settings.access_token}');
    expect(send).not.toContain('console.error("[SEND-WA] Error:", waData)');
  });
});
