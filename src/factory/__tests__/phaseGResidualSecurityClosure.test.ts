import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const metaTest = read("supabase/functions/meta-webhook-test/index.ts");
const auditMigration = read(
  "supabase/migrations/20260831205847_revoke_legacy_log_audit_authenticated_execute.sql",
);

describe("Phase G residual security closure", () => {
  it("keeps Meta diagnostic behind cron authentication before service-role work", () => {
    const authIndex = metaTest.indexOf("requireCronAuth(req)");
    const clientIndex = metaTest.indexOf("createClient(");

    expect(authIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(authIndex);
    expect(metaTest).toContain("new Response(authFailure.body");
    expect(metaTest).toContain("status: authFailure.status");
  });

  it("removes authenticated execution from legacy caller-controlled audit RPC", () => {
    expect(auditMigration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)",
    );
    expect(auditMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(auditMigration).toContain("TO service_role");
  });
});
