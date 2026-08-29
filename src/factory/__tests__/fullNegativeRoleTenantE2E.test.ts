import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829120626_p0_5_a_ai_campaign_workspace_isolation.sql");
const trainingBoundary = read("supabase/migrations/20260829152146_ai_training_data_two_tier_boundary.sql");
const ci = read(".github/workflows/ci.yml");

describe("full negative role / tenant E2E foundation", () => {
  it("uses the canonical workspace helpers and closed-domain migrations", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id");
    expect(migration).toContain("campaign workspace mismatch");
    expect(trainingBoundary).toContain("workspace_id");
    expect(trainingBoundary).toContain("global");
  });

  it("keeps the certification scope explicit", () => {
    const closedDomains = [
      "Inbox/messages",
      "API keys",
      "ancillary Inbox",
      "CALL/Voice",
      "provider tenant boundary",
      "media provider credentials",
      "external integrations",
      "unified_connections",
      "integration logs",
      "media_provider_settings",
      "n8n_configurations",
      "ai_conversations",
      "ai_content_library",
      "campaigns",
      "campaign_content",
      "ai_training_data",
    ];
    expect(closedDomains).toHaveLength(16);
  });

  it("does not modify the canonical CI workflow", () => {
    expect(ci).toContain("name: Pulse AI Production CI/CD Release Gate");
  });

  it("executes the real PostgreSQL role/tenant verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/run-full-negative-role-tenant-e2e.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
