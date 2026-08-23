import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

const inbound = read("supabase/functions/twilio-inbound-call/index.ts");
const signatures = read("supabase/functions/_shared/webhook-signatures.ts");

describe("Twilio workspace resolution safety", () => {
  it("fails closed before inbound call processing when workspace resolution fails", () => {
    expect(inbound).toContain("if (!wsCreds)");
    expect(inbound).toContain("const resolvedWorkspaceId = wsCreds.workspace_id;");
    expect(inbound).not.toContain("wsCreds?.workspace_id ?? workspaceId");
    expect(inbound).not.toMatch(/\.eq\("workspace_id",\s*resolvedWorkspaceId\)[\s\S]*function handleIvrNode/);
  });

  it("does not use the global Twilio token for explicit workspace-scoped verification", () => {
    expect(signatures).toContain("const workspaceScopedVerification = arguments.length >= 4;");
    expect(signatures).toContain("? decryptedAuthToken");
    expect(signatures).toContain("workspace_auth_token_unavailable");
  });
});
