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
