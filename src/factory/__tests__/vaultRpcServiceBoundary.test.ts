import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827173000_vault_rpc_service_boundary.sql"),
  "utf8",
);

describe("Vault RPC service-role boundary", () => {
  const signatures = [
    "vault_store_secret(uuid, text, text, text)",
    "vault_read_secret(text)",
    "vault_delete_secret(text)",
  ];

  it("removes every browser and inherited PUBLIC execution path", () => {
    for (const signature of signatures) {
      expect(migration).toContain(
        `revoke execute on function public.${signature}`,
      );
    }

    expect(migration.match(/from public, anon, authenticated;/g)).toHaveLength(3);
  });

  it("preserves the trusted backend contract only", () => {
    for (const signature of signatures) {
      expect(migration).toContain(
        `grant execute on function public.${signature}`,
      );
    }

    expect(migration.match(/to service_role;/g)).toHaveLength(3);
    expect(migration).not.toMatch(/grant execute[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/i);
  });

  it("does not overlap with function bodies, RLS, or workspace access", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/alter\s+table|create\s+policy|drop\s+policy/i);
    expect(migration).not.toMatch(/workspace_access_assignments|has_workspace_access/i);
    expect(migration).not.toMatch(/revoke\s+execute\s+on\s+all\s+functions/i);
  });
});
