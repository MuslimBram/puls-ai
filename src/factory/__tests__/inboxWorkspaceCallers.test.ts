import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const callers = {
  email: readSource("supabase/functions/send-email/index.ts"),
  sms: readSource("supabase/functions/sms-webhook/index.ts"),
  meta: readSource("supabase/functions/send-meta-message/index.ts"),
};

const rpcCall = (source: string) => {
  const start = source.indexOf('rpc("upsert_conversation_thread"');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("});", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("workspace-scoped conversation thread callers", () => {
  it("passes the authoritative email channel workspace", () => {
    expect(callers.email).toContain(
      'throw new Error("Email channel is not linked to a workspace.");',
    );
    expect(rpcCall(callers.email)).toContain(
      "_workspace_id: channel.workspace_id",
    );
  });

  it("passes the signed Twilio channel workspace for inbound SMS", () => {
    expect(callers.sms).toContain(
      'throw new Error("SMS channel is not linked to a workspace");',
    );
    expect(callers.sms).toContain(
      "resolvedWorkspaceId !== workspaceId",
    );
    expect(rpcCall(callers.sms)).toContain("_workspace_id: workspaceId");
  });

  it("passes the already-authorized workspace for Meta replies", () => {
    expect(callers.meta).toContain(
      '"channel, recipient_id, message, and workspace_id are required"',
    );
    expect(callers.meta).toContain(
      'if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);',
    );
    expect(rpcCall(callers.meta)).toContain("_workspace_id: workspace_id");
  });
});
