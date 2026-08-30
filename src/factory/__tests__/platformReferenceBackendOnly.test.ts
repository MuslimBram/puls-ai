import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829172500_platform_reference_backend_only.sql"),
  "utf8",
);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const runtimeFiles = [
  ...sourceFiles(resolve(process.cwd(), "src")),
  ...sourceFiles(resolve(process.cwd(), "supabase/functions")),
].filter((file) => {
  const normalized = file.replace(/\\/g, "/");
  return (
    !normalized.endsWith("/src/integrations/supabase/types.ts") &&
    !normalized.includes("/src/factory/__tests__/")
  );
});
const runtimeRefs = runtimeFiles.filter((file) => readFileSync(file, "utf8").includes("vault_secret_refs"));

describe("Platform protected-reference boundary", () => {
  it("has no current runtime caller that depends on browser access", () => {
    expect(runtimeRefs).toEqual([]);
  });

  it("preserves nullable global references while removing browser policies", () => {
    expect(migration).not.toContain("alter column workspace_id set not null");
    expect(migration).toContain('drop policy if exists "Workspace owners and admins can manage vault refs"');
    expect(migration).not.toMatch(/create policy/i);
  });

  it("keeps the protected-reference table backend-only", () => {
    expect(migration).toContain("from public,anon,authenticated,sandbox_exec,service_role");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("to authenticated");
  });

  it("fails closed if tenant-scoped rows appear before rollout", () => {
    expect(migration).toContain("tenant-scoped rows appeared");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL verifier", () => {
    execFileSync("bash", ["scripts/verify-platform-reference-backend-only.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
