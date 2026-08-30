import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829171500_custom_channel_adapters_backend_only.sql"),
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

// Only scan browser-accessible src/ files; exclude test files and generated types.
// Edge functions use the service-role admin client and are not broken by this migration.
const runtimeFiles = sourceFiles(resolve(process.cwd(), "src")).filter(
  (f) => !f.includes("__tests__") && !f.endsWith("/types.ts"),
);
const directCallers = runtimeFiles.filter((file) => readFileSync(file, "utf8").includes('custom_channel_adapters'));

describe("Custom channel adapters backend-only boundary", () => {
  it("has no current runtime caller that would be broken", () => {
    expect(directCallers).toEqual([]);
  });

  it("requires workspace identity and removes browser policies", () => {
    expect(migration).toContain("alter column workspace_id set not null");
    expect(migration).toContain('drop policy if exists "Admins can manage custom channel adapters"');
    expect(migration).not.toMatch(/create policy/i);
  });

  it("revokes browser/sandbox grants and leaves service-role DML only", () => {
    expect(migration).toContain("from public,anon,authenticated,sandbox_exec,service_role");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("to authenticated");
  });

  it("fails closed if live table stops being empty before rollout", () => {
    expect(migration).toContain("expected empty table changed");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL verifier", () => {
    execFileSync("bash", ["scripts/verify-custom-channel-adapters-backend-only.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
