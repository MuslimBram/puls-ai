import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const modal = read("src/components/channels/ChannelConnectionModal.tsx");
const start = read("supabase/functions/instagram-oauth-start/index.ts");
const callback = read("supabase/functions/instagram-oauth-callback/index.ts");
const send = read("supabase/functions/send-meta-message/index.ts");
const sendHook = read("src/hooks/useSendMessage.ts");
const migration = read("supabase/migrations/20260824053200_oauth_states_workspace_scope.sql");

describe("Facebook full E2E hardening", () => {
  it("scopes OAuth to the active workspace end to end", () => {
    expect(modal).toContain('useWorkspace');
    expect(modal).toContain('workspace_id: workspace.id');
    expect(start).toContain('workspace_id: workspaceId');
    expect(start).toContain('is_workspace_member');
    expect(callback).toContain('.select("state,user_id,workspace_id,channel_type,redirect_uri,expires_at")');
    expect(callback).toContain('OAuth redirect URI mismatch');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS workspace_id');
  });

  it("uses Facebook Login for Facebook instead of the Instagram authorization endpoint", () => {
    expect(start).toContain('channelType === "facebook"');
    expect(start).toContain('https://www.facebook.com/${graphVersion}/dialog/oauth');
    expect(start).toContain('pages_messaging');
    expect(start).toContain('pages_manage_metadata');
    expect(start).toContain('instagram_manage_messages');
  });

  it("exchanges Facebook OAuth server-side and stores only encrypted page credentials", () => {
    expect(callback).toContain('stateRow.channel_type === "facebook"');
    expect(callback).toContain('/me/accounts');
    expect(callback).toContain('encryptForStorage(String(page.access_token))');
    expect(callback).toContain('credentials: { page_access_token: pageAccessToken }');
    expect(callback).toContain('connection_status: "connected"');
    expect(callback).not.toContain('settings: { access_token: accessToken }');
  });

  it("sends Meta messages using the selected workspace and decrypted server-side credentials", () => {
    expect(sendHook).toContain('workspace_id: workspace.id');
    expect(send).toContain('decryptIfNeeded');
    expect(send).toContain('.eq("workspace_id", workspace_id)');
    expect(send).toContain('.eq("connection_status", "connected")');
    expect(send).toContain('credentials_encrypted');
    expect(send).toContain('Authorization: `Bearer ${accessToken}`');
  });

  it("does not log or return access tokens from the OAuth callback", () => {
    expect(callback).not.toContain('access_token: page.access_token');
    expect(callback).not.toContain('console.log(accessToken');
    expect(callback).not.toContain('page_access_token: page.access_token');
  });
});
