import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260829081527_p0_5_b1_media_provider_credentials_backend_only.sql",
);
const edgeFunction = read("supabase/functions/manage-media-provider-credentials/index.ts");
const mediaHook = read("src/hooks/useMediaAdmin.ts");

describe("P0.5-B1 media provider credential boundary", () => {
  it("removes browser policies and direct table grants", () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Admins can view media provider credentials"',
    );
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM anon",
    );
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM sandbox_exec",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_provider_credentials TO service_role",
    );
  });

  it("keeps the browser on the sanitized Edge Function contract", () => {
    expect(mediaHook).toContain(
      'supabase.functions.invoke("manage-media-provider-credentials"',
    );
    expect(mediaHook).not.toContain('.from("media_provider_credentials")');

    expect(edgeFunction).toContain(
      '.select("provider_key, credential_type, credential_label, secret_hint, is_valid, last_validated_at, last_validation_error, updated_at")',
    );
    expect(edgeFunction).not.toContain('.select("encrypted_secret")');
  });

  it("restricts global secret management to platform admins", () => {
    expect(edgeFunction).toContain('.in("role", ["admin", "super_admin"])');
    expect(edgeFunction).not.toContain('"business_owner"');
    expect(edgeFunction).toContain("Platform admin access required");
  });

  it("keeps response CORS request-scoped", () => {
    expect(edgeFunction).toContain("function json(req: Request, body: unknown");
    expect(edgeFunction).toContain("...getCors(req)");
    expect(edgeFunction).toContain("return json(req,");
  });

  it("executes the PostgreSQL privilege verifier in CI", () => {
    if (process.env.CI !== "true") return;

    execFileSync("bash", ["scripts/verify-p0-5-b1-media-credentials.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
