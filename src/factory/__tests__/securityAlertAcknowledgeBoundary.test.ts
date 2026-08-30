import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260830191500_security_alert_acknowledge_boundary.sql",
);
const migration = readFileSync(migrationPath, "utf8");

const uiPath = resolve(process.cwd(), "src/components/SecurityThreatAlerts.tsx");
const ui = readFileSync(uiPath, "utf8");

describe("security alert acknowledgement boundary", () => {
  it("removes table-wide authenticated UPDATE and grants only acknowledgement columns", () => {
    expect(migration).toContain(
      "revoke update on table public.security_alerts from authenticated;",
    );
    expect(migration).toContain(
      "grant update (status, acknowledged_at) on table public.security_alerts to authenticated;",
    );
    expect(migration).not.toMatch(
      /grant\s+update\s+on\s+(table\s+)?public\.security_alerts\s+to\s+authenticated/i,
    );
  });

  it("enforces only open to acknowledged for authenticated callers", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.role() = 'authenticated'");
    expect(migration).toContain("old.status is distinct from 'open'");
    expect(migration).toContain("new.status is distinct from 'acknowledged'");
    expect(migration).toContain("new.acknowledged_at := statement_timestamp();");
  });

  it("keeps the current UI inside the narrowed database contract", () => {
    expect(ui).toContain(
      '.update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })',
    );
    expect(ui).not.toMatch(/security_alerts"\)\.update\(\{[^}]*severity/s);
    expect(ui).not.toMatch(/security_alerts"\)\.update\(\{[^}]*signals/s);
    expect(ui).not.toMatch(/security_alerts"\)\.update\(\{[^}]*workspace_id/s);
  });
});
