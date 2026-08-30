import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831014500_security_advisor_asset_duplicate_boundary.sql"),
  "utf8",
);

describe("Security Advisor asset duplicate boundary", () => {
  it("removes browser execution from the asset/workspace lookup", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.check_asset_duplicate(text, text)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("preserves service-role execution", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)");
    expect(migration).toContain("TO service_role;");
  });
});
