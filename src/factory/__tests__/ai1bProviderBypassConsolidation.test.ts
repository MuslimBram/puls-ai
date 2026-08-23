import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import vm from "node:vm";

type CallAIOptions = {
  maxTokens?: number;
  systemPrompt?: string;
  taskType?: string;
  workspaceId?: string;
  userId?: string;
  authHeader?: string | null;
};

function loadAiClientWithMock(callAIRouter: (...args: unknown[]) => Promise<string>) {
  const filePath = join(process.cwd(), "supabase", "functions", "_shared", "ai-client.ts");
  const source = readFileSync(filePath, "utf-8").replace(
    'import { callAIRouter } from "./ai-router-helper.ts";',
    "const { callAIRouter } = __mocks__;",
  );

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} as Record<string, unknown> };
  const sandbox: Record<string, unknown> = {
    __mocks__: { callAIRouter },
    exports: module.exports,
    module,
  };
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox);
  return module.exports as {
    callAI: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, options?: CallAIOptions) => Promise<{ text: string; provider: string; model: string }>;
    askAI: (systemPrompt: string, userPrompt: string, maxTokens?: number, options?: CallAIOptions) => Promise<string>;
  };
}

describe("AI-1B shared ai-client canonicalization", () => {
  it("routes caller payload to canonical ai-router with workspace context", async () => {
    let captured: { messages: unknown; systemPrompt: unknown; options: unknown } | null = null;
    const mod = loadAiClientWithMock(async (messages, systemPrompt, options) => {
      captured = { messages, systemPrompt, options };
      return "ok";
    });

    const result = await mod.askAI("sys", "hello", 123, {
      workspaceId: "ws_1",
      taskType: "balanced",
      authHeader: "******",
      userId: "user_1",
    });

    expect(result).toBe("ok");
    expect(captured).not.toBeNull();
    expect(captured?.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(captured?.systemPrompt).toBe("sys");
    expect(captured?.options).toEqual({
      taskType: "balanced",
      workspaceId: "ws_1",
      userId: "user_1",
      authHeader: "******",
      maxTokens: 123,
    });
  });

  it("fails closed when neither workspace nor verified auth is provided", async () => {
    const mod = loadAiClientWithMock(async () => "ok");

    await expect(
      mod.askAI("sys", "hello", 50, { taskType: "balanced" }),
    ).rejects.toThrow("workspace context or verified auth");
  });

  it("requires workspace/auth context for customer_support as well", async () => {
    const mod = loadAiClientWithMock(async () => "ok");

    await expect(
      mod.askAI("sys", "hello", 100, { taskType: "customer_support" }),
    ).rejects.toThrow("workspace context or verified auth");
  });

  it("removes direct provider endpoints from shared ai-client", () => {
    const filePath = join(process.cwd(), "supabase", "functions", "_shared", "ai-client.ts");
    const source = readFileSync(filePath, "utf-8");

    expect(source).not.toContain("ai.gateway.frontend_builder.dev");
    expect(source).not.toContain("api.anthropic.com/v1/messages");
    expect(source).toContain("callAIRouter");
  });
});
