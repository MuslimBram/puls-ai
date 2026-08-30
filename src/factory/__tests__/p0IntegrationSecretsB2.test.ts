import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260829102908_p0_5_b2_integration_secret_boundary.sql",
);
const edgeFunction = read("supabase/functions/manage-integration-connections/index.ts");
const externalHook = read("src/hooks/useExternalIntegrations.ts");
const unifiedHook = read("src/hooks/useUnifiedConnections.ts");

describe("P0.5-B2 integration credential boundary", () => {
  it("makes workspace identity authoritative and removes browser table access", () => {
    expect(migration).toContain(
      "alter table public.external_integrations alter column workspace_id set not null",
    );
    expect(migration).toContain(
      "alter table public.unified_connections alter column workspace_id set not null",
    );
    expect(migration).toContain("unique (workspace_id, integration_key)");
    expect(migration).toContain(
      "drop constraint if exists external_integrations_user_id_integration_key_key",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.external_integrations from public, anon, authenticated, sandbox_exec",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.unified_connections from public, anon, authenticated, sandbox_exec",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.external_integrations to service_role",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.unified_connections to service_role",
    );
  });

  it("fails closed on cross-workspace business links", () => {
    expect(migration).toContain("bp.workspace_id <> uc.workspace_id");
    expect(migration).toContain(
      "Cannot harden unified_connections: cross-workspace business link exists",
    );
    expect(edgeFunction).toContain('.from("business_profiles")');
    expect(edgeFunction).toContain('.eq("workspace_id", input.workspace_id)');
    expect(edgeFunction).toContain("Business does not belong to this workspace");
  });

  it("routes browser CRUD through the caller-bound Edge Function", () => {
    expect(externalHook).toContain(
      'supabase.functions.invoke("manage-integration-connections"',
    );
    expect(unifiedHook).toContain(
      'supabase.functions.invoke("manage-integration-connections"',
    );
    expect(externalHook).toContain("useWorkspace");
    expect(unifiedHook).toContain("useWorkspace");
    expect(externalHook).not.toContain('.from("external_integrations")');
    expect(unifiedHook).not.toContain('.from("unified_connections")');
  });

  it("requires workspace owner/admin authorization without platform-admin bypass", () => {
    expect(edgeFunction).toContain('admin.rpc("has_workspace_role_for_user"');
    expect(edgeFunction).toContain('_roles: ["owner", "admin"]');
    expect(edgeFunction).toContain("Workspace owner/admin access required");
    expect(edgeFunction).not.toContain('has_role(authData.user.id, "admin"');
    expect(edgeFunction).not.toContain('has_role(authData.user.id, "super_admin"');
  });

  it("encrypts external credentials and never returns secret payloads", () => {
    expect(edgeFunction).toContain(
      'import { encryptForStorage } from "../_shared/token-utils.ts"',
    );
    expect(edgeFunction).toContain("encrypted[key] = await encryptForStorage(value)");
    expect(edgeFunction).toContain("credentials: {}");
    expect(edgeFunction).toContain("has_credentials:");
    expect(edgeFunction).not.toContain('select("*")');
    expect(edgeFunction).not.toContain("credentials_encrypted,");
  });

  it("keeps unified secrets in credentials_encrypted rather than config_json", () => {
    expect(unifiedHook).toContain("credentials?: Record<string, string>");
    expect(unifiedHook).toContain("credentials: params.credentials");
    expect(edgeFunction).toContain("credentials: credentialObject.optional()");
    expect(edgeFunction).toContain("containsSensitiveConfigKey(configJson)");
    expect(edgeFunction).toContain(
      "Sensitive credentials must use the encrypted credentials field",
    );
    expect(edgeFunction).toContain("credentials_encrypted: encryptedCredentials");
  });

  it("scopes every sensitive mutation by workspace_id", () => {
    const scopedMutations = [
      'action: z.literal("toggle_external")',
      'action: z.literal("delete_external")',
      'action: z.literal("test_unified")',
      'action: z.literal("update_unified_status")',
      'action: z.literal("delete_unified")',
    ];
    for (const marker of scopedMutations) expect(edgeFunction).toContain(marker);

    expect(edgeFunction.match(/\.eq\("workspace_id", input\.workspace_id\)/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("executes the PostgreSQL verifier in CI", () => {
    if (process.env.CI !== "true") return;

    execFileSync("bash", ["scripts/verify-p0-5-b2-integration-secret-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
