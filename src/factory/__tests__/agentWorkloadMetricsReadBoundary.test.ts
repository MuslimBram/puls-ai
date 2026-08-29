import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829155000_agent_workload_metrics_read_boundary.sql");
const originalView = read("supabase/migrations/20260317105948_3cbaad4d-93e4-4af2-8fef-e7a89a731041.sql");
const conversationHook = read("src/hooks/useConversationEngine.ts");

describe("agent_workload_metrics read boundary", () => {
  it("preserves the existing SECURITY INVOKER execution model", () => {
    expect(originalView).toContain("WITH (security_invoker = true)");
    expect(migration).toContain("security_invoker=true");
    expect(migration).not.toContain("create view public.agent_workload_metrics");
    expect(migration).not.toContain("drop view");
  });

  it("removes browser access and leaves service_role SELECT only", () => {
    expect(migration).toContain("from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("grant select on table public.agent_workload_metrics to service_role");
    expect(migration).not.toContain("grant select on table public.agent_workload_metrics to authenticated");
  });

  it("does not break the current workload UI because it reads conversation_threads directly", () => {
    const workload = conversationHook.slice(
      conversationHook.indexOf("export const useAgentWorkload"),
      conversationHook.indexOf("// ── Escalation Rules"),
    );
    expect(workload).toContain('.from("conversation_threads")');
    expect(workload).not.toContain('agent_workload_metrics');
  });

  it("executes the PostgreSQL ACL verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-agent-workload-metrics-read-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
