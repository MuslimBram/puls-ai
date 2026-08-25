import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260825001000_rls_auth_helper_closure.sql"),
  "utf8",
);

describe("RLS authorization helper closure", () => {
  it("narrows every formerly PUBLIC admin/owner policy to authenticated", () => {
    for (const policy of [
      '"Admins view all connection logs"',
      '"Workspace owners manage n8n config"',
      '"Admins send any messages"',
      '"Admins view all ticket messages"',
      '"Admins update all tickets"',
      '"Admins view all tickets"',
      '"Admins view all connections"',
      '"Workspace owners and admins can manage vault refs"',
    ]) {
      expect(migration).toMatch(
        new RegExp(`alter policy ${policy}\\s+on public\\.[a-z_]+ to authenticated`, "i"),
      );
    }
  });

  it("removes anonymous execution from the three RLS authorization helpers", () => {
    for (const signature of [
      "has_role(uuid, app_role)",
      "is_workspace_member(uuid, uuid)",
      "is_workspace_owner(uuid, uuid)",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${signature} to authenticated, service_role;`,
      );
    }
  });

  it("does not change policy expressions or function bodies", () => {
    expect(migration).not.toMatch(/using\s*\(|with\s+check\s*\(/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/drop\s+policy/i);
  });
});
