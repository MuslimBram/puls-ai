import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830213000_advisor_direct_rpc_boundaries.sql"),
  "utf8",
);
const duplicateAsset = readFileSync(
  resolve(process.cwd(), "supabase/functions/check-duplicate-asset/index.ts"),
  "utf8",
);

describe("Security Advisor direct caller boundaries", () => {
  it("removes authenticated direct execution from backend-only definer helpers", () => {
    for (const signature of [
      "public.log_audit(uuid, uuid, text, text, text, jsonb)",
      "public.check_asset_duplicate(text, text)",
      "public.check_freelancer_relation_eligibility(uuid, uuid, text)",
    ]) {
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION ${signature}`);
      expect(migration).toContain("FROM PUBLIC, anon, authenticated");
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
    }
  });

  it("binds explicit-user business/referral helpers to self, platform admin, or service role", () => {
    expect(migration).toContain("BUSINESS_LIMIT_SUBJECT_FORBIDDEN");
    expect(migration).toContain("_user_id IS DISTINCT FROM _caller");
    expect(migration).toContain("REFERRAL_COUNT_SUBJECT_FORBIDDEN");
    expect(migration).toContain("_referrer_user_id IS DISTINCT FROM v_caller");
    expect(migration).toContain("has_role(_caller, 'admin'::public.app_role)");
    expect(migration).toContain("has_role(v_caller, 'super_admin'::public.app_role)");
  });

  it("keeps UI-facing workspace helpers authenticated but enforces caller workspace access", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_storage_quota");
    expect(migration).toContain("NOT public.has_workspace_access(_workspace_id)");
    expect(migration).toContain("STORAGE_QUOTA_WORKSPACE_FORBIDDEN");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.check_storage_quota(uuid, text) TO authenticated, service_role");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.evaluate_contact_policy");
    expect(migration).toContain("NOT public.has_workspace_access(p_workspace_id)");
    expect(migration).toContain("CONTACT_POLICY_LEAD_WORKSPACE_MISMATCH");
    expect(migration).toContain("WHERE id=p_lead_id AND workspace_id=p_workspace_id");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.validate_nba_against_rules");
    expect(migration).toContain("NBA_WORKSPACE_FORBIDDEN");
    expect(migration).toContain("NBA_LEAD_WORKSPACE_MISMATCH");
  });

  it("fails invalid storage resource types instead of silently allowing them", () => {
    expect(migration).toContain("INVALID_STORAGE_RESOURCE_TYPE");
    expect(migration).not.toContain("ELSE\n      RETURN true");
  });

  it("does not disclose another tenant's asset id, workspace name, or exact similar identifier", () => {
    expect(duplicateAsset).toContain("sanitizedDuplicateResult");
    expect(duplicateAsset).not.toContain("registered_to");
    expect(duplicateAsset).not.toContain("existing_asset_id");
    expect(duplicateAsset).not.toContain('`Identifikues i ngjashëm me "${existing.asset_identifier}"');
    expect(duplicateAsset).not.toContain('`Emër biznesi i ngjashëm me "${existing.asset_identifier}"');
    expect(duplicateAsset).toContain('"A similar registered asset already exists."');
  });

  it("binds freelancer relation checks to the authenticated caller unless platform admin", () => {
    expect(duplicateAsset).toContain('String(freelancer_user_id) !== user.id && !isPlatformAdmin');
    expect(duplicateAsset).toContain('status: 403');
    expect(duplicateAsset).toContain('.in("role", ["admin", "super_admin"])');
  });

  it("returns generic failures without leaking privileged backend errors", () => {
    expect(duplicateAsset).toContain('JSON.stringify({ error: "Duplicate check failed" })');
    expect(duplicateAsset).not.toContain('JSON.stringify({ error: (err as Error).message })');
  });
});
