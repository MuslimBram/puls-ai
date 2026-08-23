import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

const inbound = read("supabase/functions/twilio-inbound-call/index.ts");
const signatures = read("supabase/functions/_shared/webhook-signatures.ts");

const handleIvrNodeSource = inbound
  .split("async function handleIvrNode")[1]
  ?.split("function buildIvrNodeTwiml")[0] ?? "";
const routeToAgentSource = inbound.split("async function routeToAgent")[1] ?? "";

describe("Twilio workspace resolution safety", () => {
  it("fails closed before inbound call processing when workspace resolution fails", () => {
    expect(inbound).toContain("if (!wsCreds)");
    expect(inbound).toContain("const resolvedWorkspaceId = wsCreds.workspace_id;");
    expect(inbound).not.toContain("wsCreds?.workspace_id ?? workspaceId");
  });

  it("uses helper parameters rather than out-of-scope workspace variables", () => {
    expect(handleIvrNodeSource).toContain('.eq("workspace_id", workspaceId)');
    expect(handleIvrNodeSource).not.toContain("resolvedWorkspaceId");
    expect(routeToAgentSource).toContain('.eq("workspace_id", workspaceId)');
    expect(routeToAgentSource).not.toContain("resolvedWorkspaceId");
  });

  it("does not use the global Twilio token for explicit workspace-scoped verification", () => {
    expect(signatures).toContain("const workspaceScopedVerification = arguments.length >= 4;");
    expect(signatures).toContain("? decryptedAuthToken");
    expect(signatures).toContain("workspace_auth_token_unavailable");
  });
});
