import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829152146_ai_training_data_two_tier_boundary.sql");
const rpcBoundary = read("supabase/migrations/20260827194000_public_rpc_service_boundary.sql");

describe("ai_training_data two-tier boundary", () => {
  it("preserves intentional global/system semantics", () => {
    expect(migration).toContain("Do NOT make workspace_id NOT NULL");
    expect(migration).not.toContain("alter column workspace_id set not null");
    expect(migration).toContain("workspace_id is not null");
    expect(migration).toContain("ai_training_data workspace_id is immutable");
  });

  it("removes direct browser access to the global tier and platform-role bypass", () => {
    expect(migration).toContain('drop policy if exists "training_read"');
    expect(migration).toContain('drop policy if exists "training_write"');
    expect(migration).toContain('drop policy if exists "training_update"');
    expect(migration).toContain('drop policy if exists "training_delete"');
    expect(migration).not.toContain("public.has_role(");
    expect(migration).not.toContain("'super_admin'::");
  });

  it("uses canonical tenant workspace helpers", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin'])");
  });

  it("uses least-privilege table ACLs", () => {
    expect(migration).toContain("from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.ai_training_data");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("keeps global training RPCs backend-only", () => {
    expect(rpcBoundary).toContain("revoke execute on function public.get_legal_training_response(text, text)");
    expect(rpcBoundary).toContain("revoke execute on function public.get_prohibited_rules(text)");
    expect(rpcBoundary).toContain("from public, anon, authenticated");
    expect(rpcBoundary).toContain("grant execute on function public.get_legal_training_response(text, text)");
    expect(rpcBoundary).toContain("grant execute on function public.get_prohibited_rules(text)");
    expect(rpcBoundary).toContain("to service_role");
  });

  it("executes the PostgreSQL negative-role verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-ai-training-data-two-tier-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
