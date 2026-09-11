import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const correctivePath = resolve(migrationDir, "20260828071542_harden_has_workspace_role_and_core_rls.sql");
const h = (...parts: string[]) => parts.join("");

const historical = {
  "20260827113753_p0_workspace_identity_backfill_and_constraints.sql": h("0241be4e","076d6af1","36849e5a","f75b9385","75cfe7c7","7d6bd25b","067d1419","593b4d77"),
  "20260827114248_p0_canonical_workspace_rls_core_resources.sql": h("fba5ea1f","e0463b51","cd94056e","30f213a3","90662456","cbf37c52","e9d27edd","0f642bf0"),
  "20260827152201_add_ai_learning_lessons_v2.sql": h("0cb11bbc","4bf0ffd3","ecefe0bd","760649a4","447effe5","335cb911","819eb01f","a16babde"),
  "20260827154758_add_partner_roles_ambassador_white_label.sql": h("36db1ce5","a7739d09","60b89e87","2b4ea944","68bba118","df7dd98c","456c03f1","7c3d06ac"),
  "20260827154920_add_canonical_role_definitions.sql": h("f35b9358","396b10bb","7da33224","e8e98322","50b2d448","5e9fffbe","cf8013d0","d777d7e5"),
  "20260827160224_secure_admin_role_two_person_approval.sql": h("c6faecf6","26cf8bdd","596771c7","3a0894ed","b6ea4ea0","b2c47354","20650359","34c33f02"),
  "20260827160328_lock_ai_admin_review_to_service.sql": h("027d31ce","557f8772","5a8e10fe","43b08445","00f08ce7","9c0e84a4","b9ad19f0","a4f5db5e"),
  "20260827160728_canonical_partner_workspace_access.sql": h("7ce31905","912c18c1","7c879796","dd06075a","7f7587d5","3927c6d5","4342c7a0","9439082f"),
  "20260827190129_add_workspace_assignment_expiry.sql": h("b2df216f","35c0be7a","3e7ef2ec","8af97198","d4780c1a","b170f083","13835b1d","cb962b83"),
  "20260827190233_harden_workspace_access_support_and_admin_workflows_v2.sql": h("3de7dc9e","45ab9a47","641e1ab6","d67dbb2f","c3b0ba49","ae270d49","84b03dfe","100a4fc7"),
  "20260827190330_add_audited_support_session_rpc.sql": h("d6dd6a44","8ffcd55b","df2c41db","b404ca35","e6370d48","fd2c0505","f3d2e371","a6efe2a5"),
  "20260827190506_require_support_session_for_admin_private_data.sql": h("b20759e1","7374ae1e","1d0d3ffa","9da21e2c","41a0e2df","b46fb2df","7de9c46c","6f1f7419"),
  "20260827191457_least_privilege_admin_workflow_table_grants.sql": h("659fefc5","411473c6","b2e2cdde","8213e225","1dfa9ec7","81bd9625","1fd48272","64226165"),
} as const;

const normalizeLedgerStatement = (sql: string) => sql.replace(/\r\n/g, "\n").replace(/[\r\n\t ]+$/, "");
const corrective = readFileSync(correctivePath, "utf8").replace(/\r\n/g, "\n");

function policyBlock(sql: string, policyName: string) {
  const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`create policy "${escaped}"[\\s\\S]*?(?=\\ncreate policy|\\n\\ncommit;|$)`, "i"));
  return match?.[0] ?? "";
}

describe("P0 workspace reconciliation", () => {
  it("contains all 13 historical Production migrations", () => {
    for (const file of Object.keys(historical)) expect(existsSync(resolve(migrationDir, file))).toBe(true);
  });

  it("matches the Production ledger SQL hashes after removing only file-terminal whitespace", () => {
    for (const [file, expectedHash] of Object.entries(historical)) {
      const sql = normalizeLedgerStatement(readFileSync(resolve(migrationDir, file), "utf8"));
      expect(createHash("sha256").update(sql).digest("hex"), file).toBe(expectedHash);
    }
  });

  it("orders dependent policy drops before the legacy helper drop", () => {
    const policyDrop = corrective.indexOf('drop policy if exists "workspace members can view business profiles"');
    const functionDrop = corrective.indexOf("drop function if exists public.has_workspace_role(uuid, uuid, text[]);");
    expect(policyDrop).toBeGreaterThanOrEqual(0);
    expect(functionDrop).toBeGreaterThan(policyDrop);
    expect(corrective).not.toMatch(/\\bcascade\\b/i);
  });

  it("uses a caller-bound browser helper and service-only explicit-user helper", () => {
    expect(corrective).toContain("create function public.has_workspace_role(_workspace_id uuid, _roles text[])");
    expect(corrective).toContain("auth.uid()");
    expect(corrective).not.toContain("create function public.has_workspace_role(_user_id uuid, _workspace_id uuid, _roles text[])");
    expect(corrective).toContain("revoke all on function public.has_workspace_role(uuid, text[]) from public, anon, authenticated;");
    expect(corrective).toContain("grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;");
    expect(corrective).toContain("revoke all on function public.has_workspace_role_for_user(uuid, uuid, text[]) from public, anon, authenticated;");
    expect(corrective).toContain("grant execute on function public.has_workspace_role_for_user(uuid, uuid, text[]) to service_role;");
    expect(corrective).toContain("set search_path = ''");
  });

  it("includes active assignment capacity mapping with expiry enforcement", () => {
    for (const mapping of ["when 'business_admin' then 'admin'", "when 'manager' then 'member'", "when 'employee' then 'member'", "when 'freelancer' then 'member'"]) expect(corrective).toContain(mapping);
    expect(corrective).toContain("waa.is_active");
    expect(corrective).toContain("(waa.expires_at is null or waa.expires_at > pg_catalog.now())");
    expect(corrective).toContain("create function public.has_workspace_role_for_user");
  });

  it("removes global platform-admin bypass from all four core SELECT policies", () => {
    for (const resource of ["business_profiles", "leads", "channels", "conversation_threads"]) {
      const match = corrective.match(new RegExp(`create policy "p0 workspace members can view[^\\n]*"\\s+on public\\.${resource} for select[\\s\\S]*?(?=\\n\\ncreate policy|\\n\\n--|\\n\\ncommit;)`, "i"));
      const block = match?.[0] ?? "";
      expect(block, resource).not.toMatch(/has_role\([^)]*['"]admin['"]\)/i);
      expect(block, resource).toMatch(/has_workspace_access\(workspace_id\)/i);
    }
  });

  it("enforces the conservative delete matrix and UPDATE USING + WITH CHECK", () => {
    for (const resource of ["business profiles", "channels", "leads", "conversation threads"]) {
      const block = policyBlock(corrective, `p0 owners and admins can delete ${resource}`);
      expect(block).toMatch(/array\['owner','admin'\]/);
      expect(block).not.toMatch(/'member'/);
    }
    for (const resource of ["business profiles", "channels"]) {
      const block = policyBlock(corrective, `p0 owners and admins can update ${resource}`);
      expect(block).toContain("using (public.has_workspace_role");
      expect(block).toContain("with check (public.has_workspace_role");
    }
    for (const resource of ["leads", "conversation threads"]) {
      const block = policyBlock(corrective, `p0 workspace members can update ${resource}`);
      expect(block).toContain("using (public.has_workspace_role");
      expect(block).toContain("with check (public.has_workspace_role");
    }
  });

  it("keeps viewer read-only and ambassador outside workspace access", () => {
    const writePolicies = corrective.match(/create policy[\s\S]*?(?=\ncreate policy|\n\n--|\n\ncommit;)/gi) ?? [];
    for (const policy of writePolicies) if (/for (insert|update|delete)/i.test(policy)) expect(policy).not.toMatch(/'viewer'/i);
    expect(corrective).not.toContain("'ambassador'");
    expect(corrective).not.toContain("white_label");
  });
});
