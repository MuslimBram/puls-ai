import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260827192000_correct_workspace_role_and_core_rls.sql");

const canonicalMigrations: Record<string, string> = {
  "20260827190129_add_workspace_assignment_expiry.sql": "a9230bf372fd1cbbb645e69e60e6d37c109b36bf",
  "20260827190233_harden_workspace_access_support_and_admin_workflows_v2.sql": "6b65072adc59c129502c8318f92379f92588214c",
  "20260827190330_add_audited_support_session_rpc.sql": "03dcd198f399ea737aeb6ad9c281b2b71648149c",
  "20260827190506_require_support_session_for_admin_private_data.sql": "219196b47e8f4925f1597f03c40419af68b50eab",
  "20260827191457_least_privilege_admin_workflow_table_grants.sql": "6ad2e16fa5ad8414c2b9f162b830c98d6e00982a",
};

const gitBlobSha = (content: string) =>
  createHash("sha1").update(`blob ${Buffer.byteLength(content, "utf8")}\0${content}`, "utf8").digest("hex");

describe("workspace access corrective migration contract", () => {
  it("makes has_workspace_role caller-bound and removes anonymous/arbitrary-user browser execution", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.has_workspace_role(uuid, uuid, text[]);");
    expect(migration).toContain("_workspace_id uuid,");
    expect(migration).toContain("_roles text[]");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, text[]) TO authenticated;");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.has_workspace_role_for_user(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.has_workspace_role_for_user(uuid, uuid, text[]) TO service_role;");
  });

  it("removes global platform-admin bypass from all four core SELECT policies", () => {
    expect(migration).not.toContain("has_role(auth.uid(), 'admin')");
    for (const table of ["business_profiles", "channels", "leads", "conversation_threads"]) {
      expect(migration).toContain(`ON public.${table} FOR SELECT TO authenticated`);
      expect(migration).toContain("USING (public.has_workspace_access(workspace_id));");
    }
  });

  it("does not grant ordinary members DELETE on any core resource", () => {
    expect(migration).toContain("ARRAY['owner','admin']));\n\nCREATE POLICY \"workspace owners and admins can delete");
    expect(migration).not.toContain("FOR DELETE TO authenticated\nUSING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])");
  });

  it("has USING and WITH CHECK on every core UPDATE policy", () => {
    for (const table of ["business_profiles", "channels", "leads", "conversation_threads"]) {
      const start = migration.indexOf(`ON public.${table} FOR UPDATE TO authenticated`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = migration.indexOf(";", start);
      const block = migration.slice(start, end + 1);
      expect(block).toContain("USING (");
      expect(block).toContain("WITH CHECK (");
    }
  });

  it("preserves the exact five Production migration files", () => {
    for (const [name, expectedSha] of Object.entries(canonicalMigrations)) {
      const content = read(`supabase/migrations/${name}`);
      expect(gitBlobSha(content)).toBe(expectedSha);
    }
  });
});
