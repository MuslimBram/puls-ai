import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260828080000_p0_2_inbox_api_key_workspace_isolation.sql");
const voice = read("src/hooks/useCallInboxIntegration.ts");
const apiKeyClient = read("src/hooks/usePublicApi.ts");
const apiKeyManager = read("supabase/functions/manage-api-keys/index.ts");
const publicApi = read("supabase/functions/public-api/index.ts");
const ciContract = read("scripts/verify-p0-2-migration.sh");

describe("P0.2 Inbox and API-key workspace isolation", () => {
  it("backfills only uniquely mapped legacy rows before enforcing NOT NULL", () => {
    expect(migration).toContain("having count(distinct workspace_id) = 1");
    expect(migration).toContain("update public.inbox_messages");
    expect(migration).toContain("update public.api_keys");
    expect(migration).toContain("unresolved legacy rows remain");
    expect(migration).toContain("alter table public.inbox_messages alter column workspace_id set not null");
    expect(migration).toContain("alter table public.api_keys alter column workspace_id set not null");
  });

  it("replaces user-owned policies with canonical workspace role policies", () => {
    for (const legacy of [
      "Users can view own inbox messages",
      "Users can update own inbox messages",
      "Users view own API keys",
      "Users update own API keys metadata",
    ]) expect(migration).toContain(`drop policy if exists "${legacy}"`);

    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_active_support_scope(workspace_id, 'messages')");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin'])");

    const inboxUpdate = migration.match(/create policy "p0 workspace members can update inbox messages"[\s\S]*?;/i)?.[0] ?? "";
    expect(inboxUpdate).toContain("using (public.has_workspace_role");
    expect(inboxUpdate).toContain("with check (public.has_workspace_role");
  });

  it("removes anonymous and dangerous grants and keeps API keys Edge-Function-only", () => {
    expect(migration).toContain("revoke all on table public.inbox_messages from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.inbox_messages to authenticated");
    expect(migration).toContain("revoke truncate, trigger, references on table public.inbox_messages from authenticated");
    expect(migration).toContain("revoke all on table public.api_keys from public, anon, authenticated");
    expect(migration).not.toMatch(/grant\s+[^;]*on table public\.api_keys to authenticated/i);
  });

  it("retires the arbitrary-user thread overload and adds an RLS-invoker caller-bound RPC", () => {
    expect(migration).toContain("drop function if exists public.upsert_conversation_thread(uuid, text, text, text, text, text)");
    expect(migration).toContain("create or replace function public.upsert_my_conversation_thread");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("v_user_id uuid := (select auth.uid())");
    expect(migration).toContain("if not public.has_workspace_role(_workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("grant execute on function public.upsert_my_conversation_thread");
  });

  it("moves Voice to the authoritative call-record workspace and the caller-bound RPC", () => {
    expect(voice).toContain('.from("call_records")');
    expect(voice).toContain('.select("workspace_id")');
    expect(voice).toContain('"upsert_my_conversation_thread"');
    expect(voice).toContain("_workspace_id: workspaceId");
    expect(voice).not.toContain('"upsert_conversation_thread"');
    expect(voice).not.toContain("_user_id:");
  });

  it("requires active-workspace context for every API-key UI action", () => {
    expect(apiKeyClient).toContain("useWorkspace");
    expect(apiKeyClient).toContain('queryKey: ["api-keys", user?.id, workspace?.id]');
    expect(apiKeyClient).toContain('body: { action: "list", workspace_id: requireWorkspaceId() }');
    expect(apiKeyClient).toContain('body: { action: "logs", workspace_id: requireWorkspaceId() }');
    expect(apiKeyClient).toContain('body: { action: "revoke", workspace_id: requireWorkspaceId(), key_id: keyId }');
    expect(apiKeyClient).toContain('body: { action: "create", workspace_id: requireWorkspaceId(), ...params }');
  });

  it("authorizes API-key management server-side and scopes every operation", () => {
    expect(apiKeyManager).toContain('rpc("has_workspace_role_for_user"');
    expect(apiKeyManager).toContain('_roles: ["owner", "admin"]');
    expect(apiKeyManager).toContain("const workspaceId = requireWorkspaceId(body)");
    expect(apiKeyManager).not.toContain("workspace_id: body.workspace_id || null");
    expect((apiKeyManager.match(/\.eq\("workspace_id", workspaceId\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(apiKeyManager).toContain("ALLOWED_PERMISSIONS");
    expect(apiKeyManager).toContain("rateLimit > 60");
    expect(apiKeyManager).not.toMatch(/JSON\.stringify\(\{[\s\S]*key_hash/);
  });

  it("binds public API reads, writes, analytics, automations and webhooks to the key workspace", () => {
    expect(publicApi).toContain("Invalid or unscoped API key");
    expect((publicApi.match(/\.eq\("workspace_id", workspace_id\)/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(publicApi).toContain('.eq("workspace_id", workspaceId)');
    expect(publicApi).not.toContain('.eq("user_id", user_id)');
    expect(publicApi).toContain('message_content: body.message');
    expect(publicApi).toContain('source_name: "Public API"');
    expect(publicApi).not.toContain("message_body:");
    expect(publicApi).toContain("fireZapierWebhooks(user_id, workspace_id");
  });

  it("executes the migration against PostgreSQL and performs a caller-bound runtime check in CI", () => {
    expect(ciContract).toContain("20260828080000_p0_2_inbox_api_key_workspace_isolation.sql");
    expect(ciContract).toContain("Legacy workspace-less thread function remains");
    expect(ciContract).toContain("Caller-bound thread runtime test failed");
  });
});
