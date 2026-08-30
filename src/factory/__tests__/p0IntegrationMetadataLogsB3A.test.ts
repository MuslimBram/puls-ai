import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829112718_p0_5_b3a_integration_metadata_logs.sql");
const integrationBoundary = read("supabase/functions/manage-integration-connections/index.ts");
const mediaBoundary = read("supabase/functions/manage-media-provider-credentials/index.ts");
const telegramWebhook = read("supabase/functions/telegram-webhook/index.ts");
const externalHook = read("src/hooks/useExternalIntegrations.ts");
const unifiedHook = read("src/hooks/useUnifiedConnections.ts");
const mediaHook = read("src/hooks/useMediaAdmin.ts");

describe("P0.5-B3A integration metadata/log boundary", () => {
  it("adds authoritative workspace identity to integration logs and removes browser access", () => {
    expect(migration).toContain("alter table public.integration_event_logs alter column workspace_id set not null");
    expect(migration).toContain("alter table public.connection_logs alter column workspace_id set not null");
    expect(migration).toContain("metadata workspace mismatch");
    expect(migration).toContain("revoke all privileges on table public.integration_event_logs from public, anon, authenticated, sandbox_exec");
    expect(migration).toContain("revoke all privileges on table public.connection_logs from public, anon, authenticated, sandbox_exec");
    expect(migration).toContain("grant select, insert, update, delete on table public.integration_event_logs to service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.connection_logs to service_role");
  });

  it("keeps legacy runtime writers safe during the B3A rollout", () => {
    expect(migration).toContain("create or replace function public.resolve_integration_event_log_workspace()");
    expect(migration).toContain("create or replace function public.resolve_connection_log_workspace()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("before insert or update of workspace_id, integration_id, connection_id, metadata");
    expect(migration).toContain("before insert or update of workspace_id, connection_id, metadata");
    expect(migration).toContain("grant execute on function public.resolve_integration_event_log_workspace() to service_role");
    expect(migration).toContain("grant execute on function public.resolve_connection_log_workspace() to service_role");
  });

  it("moves media provider metadata behind the existing platform-admin boundary", () => {
    expect(migration).toContain("revoke all privileges on table public.media_provider_settings from public, anon, authenticated, sandbox_exec");
    expect(mediaBoundary).toContain('action: z.literal("list_settings")');
    expect(mediaBoundary).toContain('action: z.literal("upsert_setting")');
    expect(mediaBoundary).toContain("Provider config must not contain credential or secret values");
    expect(mediaBoundary).toContain("api_secret_name must be an environment secret name");
    expect(mediaHook).toContain('body: { action: "list_settings" }');
    expect(mediaHook).toContain('action: "upsert_setting"');
    expect(mediaHook).not.toContain('.from("media_provider_settings")');
  });

  it("routes browser log reads and writes through the workspace Edge Function", () => {
    expect(externalHook).toContain('action: "list_integration_logs"');
    expect(externalHook).not.toContain('.from("integration_event_logs")');
    expect(unifiedHook).toContain('action: "list_connection_logs"');
    expect(unifiedHook).not.toContain('.from("connection_logs")');
    expect(integrationBoundary).toContain('action: z.literal("list_integration_logs")');
    expect(integrationBoundary).toContain('action: z.literal("list_connection_logs")');
    expect(integrationBoundary).toContain('admin.from("connection_logs").insert');
    expect(integrationBoundary).not.toContain('select("*")');
    expect(integrationBoundary).toContain('.select("id,integration_id,event_type,event_message,metadata,created_at,status,adapter_key")');
    expect(integrationBoundary).not.toContain('.select("id,integration_id,event_type,event_message,metadata,payload');
  });

  it("makes the Telegram runtime writer workspace-authoritative", () => {
    expect(telegramWebhook).toContain('workspace_id: workspaceId');
    expect(telegramWebhook).toContain('.eq("workspace_id", workspaceId)');
    expect(telegramWebhook).toContain('.eq("integration_key", "telegram")');
    expect(telegramWebhook).not.toContain('.eq("user_id", channel.user_id)\n      .eq("integration_key", "telegram")');
  });

  it("executes the PostgreSQL B3A verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-p0-5-b3a-integration-metadata-logs.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
