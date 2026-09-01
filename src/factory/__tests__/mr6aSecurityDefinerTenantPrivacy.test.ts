import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901190000_mr6a_security_definer_tenant_privacy.sql"), "utf8");
const duplicateEdge = readFileSync(resolve(process.cwd(), "supabase/functions/check-duplicate-asset/index.ts"), "utf8");

describe("MR6-A SECURITY DEFINER tenant privacy closure", () => {
  it("makes proven backend-only RPCs service-role only", () => {
    for (const signature of ["check_asset_duplicate(text, text)","check_freelancer_relation_eligibility(uuid, uuid, text)","evaluate_contact_policy(uuid, uuid, text, text)","validate_nba_against_rules(uuid, text, numeric, text, uuid)"]) {
      expect(migration).toContain(`revoke execute on function public.${signature} from public, anon, authenticated;`);
      expect(migration).toContain(`grant execute on function public.${signature} to service_role;`);
    }
  });
  it("removes authenticated execution from the trigger-only parent-workspace guard", () => {
    expect(migration).toContain("revoke execute on function public.enforce_p0_5_a_parent_workspace() from public, anon, authenticated;");
  });
  it("caller-binds user and workspace RPCs that must remain authenticated", () => {
    expect(migration).toContain("BUSINESS_LIMIT_SUBJECT_FORBIDDEN");
    expect(migration).toContain("_user_id is distinct from auth.uid()");
    expect(migration).toContain("coalesce(_user_id = auth.uid(), false)");
    expect(migration).toContain("public.has_workspace_role(_workspace_id, array['owner','admin','member','viewer'])");
    expect(migration).toContain("REFERRAL_COUNT_SUBJECT_FORBIDDEN");
    expect(migration).toContain("create or replace function public.community_workspace_authorized");
  });
  it("does not blanket-revoke caller-bound RLS/admin helpers", () => {
    for (const signature of ["has_role","has_workspace_access","has_workspace_role","is_workspace_member","is_workspace_owner","community_is_staff","is_platform_operator","assign_thread_round_robin"]) {
      expect(migration).not.toMatch(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\(`, "i"));
    }
    expect(migration).not.toMatch(/revoke\s+execute\s+on\s+all\s+functions/i);
  });
  it("never returns another tenant's asset or workspace identifiers", () => {
    expect(migration).not.toContain("existing_asset_id");
    expect(migration).not.toContain("registered_to");
    expect(duplicateEdge).not.toContain('.select("asset_identifier, asset_type, workspace_id")');
    expect(duplicateEdge).not.toContain("existing_asset_id");
    expect(duplicateEdge).not.toContain("registered_to");
    expect(duplicateEdge).not.toContain("${existing.asset_identifier}");
    expect(duplicateEdge).toContain("A similar asset is already registered.");
    expect(duplicateEdge).toContain("A similar business name is already registered.");
  });
  it("derives freelancer relation subject from the authenticated JWT", () => {
    expect(duplicateEdge).toContain("_freelancer_id: user.id");
    expect(duplicateEdge).not.toContain("_freelancer_id: freelancer_user_id");
    expect(duplicateEdge).toContain("Invalid relation_type");
  });
  it("sanitizes unexpected backend errors", () => {
    expect(duplicateEdge).toContain("Internal duplicate check error");
    expect(duplicateEdge).not.toContain("(err as Error).message");
  });
});
