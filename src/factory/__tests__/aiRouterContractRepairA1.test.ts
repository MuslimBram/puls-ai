import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("AI-1A1 Router Contract Repair", () => {
  it("normalizes canonical task types and required alias mappings with safe unknown handling", () => {
    const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

    expect(router).toContain("const TASK_TYPE_ALIASES");
    expect(router).toContain('brain: "complex_reasoning"');
    expect(router).toContain('voice_ai: "high_volume"');
    expect(router).toContain('text_classification: "balanced"');
    expect(router).toContain('multimodal_vision: "multimodal"');
    expect(router).toContain('code: "UNSUPPORTED_TASK_TYPE"');
    expect(router).toContain('code: "TASK_TYPE_ROUTE_UNDEFINED"');
  });

  it("normalizeTaskType is declared at module scope (not nested inside another function)", () => {
    const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

    // The function declaration must appear at module scope:
    // a line that starts (after optional whitespace) with `function normalizeTaskType`
    // and NOT be indented inside another function body.
    const lines = router.split("\n");

    const declarationLine = lines.findIndex(l => /^\s*function\s+normalizeTaskType\s*\(/.test(l));
    expect(declarationLine).toBeGreaterThanOrEqual(0);

    // Module-scope declarations have 0 indentation (or at most the file's base indent).
    // A nested function inside classifyTask would be indented with >= 2 spaces.
    const indent = lines[declarationLine].match(/^(\s*)/)?.[1] ?? "";
    expect(indent.length).toBe(0);

    // Verify the call site in the request handler (outside classifyTask) is reachable:
    // the call must appear AFTER the declaration in the file.
    const callLine = lines.findIndex((l, i) => i > declarationLine && /normalizeTaskType\(/.test(l));
    expect(callLine).toBeGreaterThan(declarationLine);

    // The declaration must NOT be nested inside classifyTask — confirm classifyTask
    // closes before normalizeTaskType is declared (i.e., the declaration line is
    // not enclosed within classifyTask's body).
    const classifyTaskDecl = lines.findIndex(l => /^\s*function\s+classifyTask\s*\(/.test(l));
    // normalizeTaskType must be declared AFTER classifyTask's closing brace or BEFORE it —
    // in either case, it must not be between the function's opening and closing braces.
    // We detect this by checking that the function body scan does not cross it.
    if (classifyTaskDecl >= 0 && declarationLine > classifyTaskDecl) {
      // Count brace depth from classifyTask start to normalizeTaskType declaration.
      let depth = 0;
      let encounteredOpen = false;
      for (let i = classifyTaskDecl; i < declarationLine; i++) {
        for (const ch of lines[i]) {
          if (ch === "{") { depth++; encounteredOpen = true; }
          if (ch === "}") { depth--; }
        }
      }
      // If depth is 0 (or less) after classifyTask opened, normalizeTaskType is outside it.
      expect(encounteredOpen && depth <= 0).toBe(true);
    }
  });

  it("preserves user JWT + workspace authorization and blocks service-role bearer-only escalation", () => {
    const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

    expect(router).toContain("await supabase.auth.getUser(bearerToken)");
    expect(router).toContain('rpc("is_workspace_member"');
    expect(router).toContain("Forbidden: not a member of workspace");
    expect(router).toContain("bearerToken === getServiceKey()");
    expect(router).toContain("SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET");
    expect(router).toContain('req.headers.get("x-internal-secret") === secret');
  });

  it("keeps provider fallback flow and provider count comment aligned with current registry", () => {
    const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

    expect(router).toContain("14 providers");
    expect(router).toContain("route.fallback");
    expect(router).toContain("All AI providers failed");
  });

  it("repairs customer-brain and voice-ai-relay internal caller contract for ai-router", () => {
    const customerBrain = readFileSync(repoFile("supabase", "functions", "customer-brain", "index.ts"), "utf-8");
    const voiceRelay = readFileSync(repoFile("supabase", "functions", "voice-ai-relay", "index.ts"), "utf-8");

    expect(customerBrain).toContain('task_type: "brain"');
    expect(customerBrain).toContain("workspace_id: workspaceId");
    expect(customerBrain).toContain('"x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? ""');

    expect(voiceRelay).toContain('task_type: "voice_ai"');
    expect(voiceRelay).toContain("workspace_id: workspaceId");
    expect(voiceRelay).toContain('"x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? ""');
  });

  it("covers community callers and telegram helper against the canonical router contract", () => {
    const assessProfile = readFileSync(repoFile("supabase", "functions", "community-assess-profile", "index.ts"), "utf-8");
    const scanImage = readFileSync(repoFile("supabase", "functions", "community-scan-image", "index.ts"), "utf-8");
    const telegramWebhook = readFileSync(repoFile("supabase", "functions", "telegram-webhook", "index.ts"), "utf-8");
    const routerHelper = readFileSync(repoFile("supabase", "functions", "_shared", "ai-router-helper.ts"), "utf-8");

    expect(assessProfile).toContain('task_type: "text_classification"');
    expect(scanImage).toContain('task_type: "multimodal_vision"');
    expect(telegramWebhook).toContain("callAIRouter(");
    expect(telegramWebhook).toContain('taskType: "text_classification"');

    expect(routerHelper).toContain('/functions/v1/ai-router');
    expect(routerHelper).toContain('headers["x-internal-secret"] = internalSecret');
    expect(routerHelper).toContain('headers.Authorization = ["Bearer", getServiceKey()].join(" ")');
  });
});
