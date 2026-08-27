import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260827194000_public_rpc_service_boundary.sql",
  ),
  "utf8",
);

describe("public SECURITY DEFINER RPC service boundary", () => {
  const signatures = [
    "get_legal_training_response(text, text)",
    "get_prohibited_rules(text)",
    "verify_white_label_license(text)",
  ];

  it("removes inherited and direct browser execution", () => {
    for (const signature of signatures) {
      expect(migration).toContain(
        `revoke execute on function public.${signature}`,
      );
    }

    expect(migration.match(/from public, anon, authenticated;/g)).toHaveLength(3);
  });

  it("preserves only the trusted backend contract", () => {
    for (const signature of signatures) {
      expect(migration).toContain(
        `grant execute on function public.${signature}`,
      );
    }

    expect(migration.match(/to service_role;/g)).toHaveLength(3);
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/i);
    expect(migration).not.toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  it("does not overlap with function bodies, RLS, or workspace access", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/alter\s+table|create\s+policy|drop\s+policy/i);
    expect(migration).not.toMatch(
      /workspace_access_assignments|has_workspace_access|upsert_conversation_thread/i,
    );
    expect(migration).not.toMatch(
      /revoke\s+execute\s+on\s+all\s+functions/i,
    );
  });
});
