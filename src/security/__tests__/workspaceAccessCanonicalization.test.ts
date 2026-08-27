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
  it("removes anonymous execution and arbitrary browser user IDs from has_workspace_role", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.has_workspace_role(uuid, uuid, text[]);");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_workspace_role(\n  _workspace_id uuid,\n  _roles text[]");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, text[]) TO authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.has_workspace_role_for_user(uuid, uuid, text[]) TO service_role;");
  });

  it("contains no global platform-admin bypass in the four core SELECT policies", () => {
    expect(migration).not.toMatch(/has_role\s*\(\s*auth\.uid\(\)\s*,\s*'admin'/);
    for (const table of ["business_profiles", "channels", "leads", "conversation_threads"]) {
      expect(migration).toContain(`ON public.${table} FOR SELECT TO authenticated`);
      expect(migration).toContain("USING (public.has_workspace_access(workspace_id));");
    }
  });

  it("gives delete rights only to owner/admin on core resources", () => {
    const deletePolicies = [
      ["business_profiles", "workspace owners and admins can delete business profiles"],
      ["channels", "workspace owners and admins can delete channels"],
      ["leads", "workspace owners and admins can delete leads"],
      ["conversation_threads", "workspace owners and admins can delete conversation threads"],
    ];
    for (const [table, name] of deletePolicies) {
      const pattern = new RegExp(`CREATE POLICY \\"${name}\\"[\\s\\S]*?ON public\\.${table} FOR DELETE TO authenticated[\\s\\S]*?ARRAY\\['owner','admin'\\]`);
      expect(migration).toMatch(pattern);
    }
    expect(migration).not.toMatch(/FOR DELETE TO authenticated[\s\S]*?ARRAY\['owner','admin','member'\]/);
  });

  it("requires USING and WITH CHECK on every core UPDATE policy", () => {
    const updateBlocks = migration.match(/CREATE POLICY [\s\S]*?FOR UPDATE TO authenticated[\s\S]*?WITH CHECK \([^;]+\);/g) ?? [];
    expect(updateBlocks).toHaveLength(4);
    for (const block of updateBlocks) {
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
