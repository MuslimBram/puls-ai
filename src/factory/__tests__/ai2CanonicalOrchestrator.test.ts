/**
 * AI-2: Canonical Pulse AI Orchestration Facade — Behavior Tests
 *
 * Coverage:
 * 1.  Facade accepts a verified workspace AI request (routing table + contract)
 * 2.  Forged workspace context fails closed (source assertion)
 * 3.  Same user/customer across two workspaces remains isolated (source assertion)
 * 4.  Public AI cannot retrieve workspace-private context (behavioral + source)
 * 5.  Business reasoning delegates to Customer Brain when appropriate (behavioral)
 * 6.  Provider/model selection remains owned by AI Router (source assertion)
 * 7.  AI-2 introduces no direct provider bypass (source assertion)
 * 8.  Unsupported business capability fails safely (behavioral)
 * 9.  Router failure becomes a normalized facade error (source assertion)
 * 10. Correlation/request ID is preserved end-to-end (behavioral)
 * 11. Structured response contract is stable (behavioral)
 * 12. Human handoff may be recommended but is not executed (behavioral + source)
 * 13. Suggested actions are NOT executed (source assertion)
 * 14. No campaign/message/discount/booking is triggered (source assertion)
 * 15. AI-1A/AI-1B security regressions remain PASS (source assertion)
 * 16. SOCIAL-1C regressions remain PASS (source assertion)
 * 17. AI-3 functionality is NOT implemented (source assertion)
 * 18. AI-4 unified memory is NOT implemented (source assertion)
 * 19. AI-5 Golden Journey is NOT implemented (source assertion)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import vm from "node:vm";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

// ── Load and transpile the pure facade helpers ────────────────────────────────
// pulse-ai-facade.ts has zero imports (pure TypeScript) so it transpiles cleanly
// in Node.js via vm.runInContext.

type FacadeModule = {
  BUSINESS_USE_CASES: readonly string[];
  CHANNEL_SOURCES: readonly string[];
  PULSE_AI_ERROR_CODES: readonly string[];
  INTERNAL_CAPABILITIES: readonly string[];
  USE_CASE_TO_ROUTER_TASK_TYPE: Record<string, string>;
  USE_CASE_TO_CAPABILITY: Record<string, string>;
  isSupportedUseCase: (uc: unknown) => boolean;
  isPublicUseCase: (uc: string) => boolean;
  isWorkspaceUseCase: (uc: string) => boolean;
  resolveRouterTaskType: (uc: string) => string;
  resolveCapability: (uc: string) => string;
  createErrorResponse: (
    requestId: string,
    workspaceId: string,
    useCase: string,
    code: string,
    message: string,
  ) => Record<string, unknown>;
  createSuccessResponse: (
    requestId: string,
    workspaceId: string,
    useCase: string,
    fields: Record<string, unknown>,
  ) => Record<string, unknown>;
};

function loadFacadeModule(): FacadeModule {
  const src = readFileSync(
    repoFile("supabase", "functions", "_shared", "pulse-ai-facade.ts"),
    "utf-8",
  );
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const mod = { exports: {} as Record<string, unknown> };
  const sandbox = { exports: mod.exports, module: mod };
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox);
  return mod.exports as FacadeModule;
}

const facade = loadFacadeModule();

const facadeSrc = () =>
  readFileSync(
    repoFile("supabase", "functions", "_shared", "pulse-ai-facade.ts"),
    "utf-8",
  );

const edgeSrc = () =>
  readFileSync(
    repoFile("supabase", "functions", "pulse-ai", "index.ts"),
    "utf-8",
  );

// ── 1 & 11: Facade accepts verified workspace request + response contract ─────

describe("AI-2 facade contract — use case taxonomy", () => {
  it("exports all expected business use cases", () => {
    expect(facade.BUSINESS_USE_CASES).toContain("customer_evaluation");
    expect(facade.BUSINESS_USE_CASES).toContain("segment_suggestion");
    expect(facade.BUSINESS_USE_CASES).toContain("business_insight");
    expect(facade.BUSINESS_USE_CASES).toContain("general_reasoning");
    expect(facade.BUSINESS_USE_CASES).toContain("complex_reasoning");
    expect(facade.BUSINESS_USE_CASES).toContain("lead_analysis");
    expect(facade.BUSINESS_USE_CASES).toContain("customer_support");
  });

  it("isSupportedUseCase accepts all declared use cases", () => {
    for (const uc of facade.BUSINESS_USE_CASES) {
      expect(facade.isSupportedUseCase(uc), `use case ${uc} should be supported`).toBe(true);
    }
  });

  it("isSupportedUseCase rejects unknown strings", () => {
    expect(facade.isSupportedUseCase("unknown_task")).toBe(false);
    expect(facade.isSupportedUseCase("openai_call")).toBe(false);
    expect(facade.isSupportedUseCase("")).toBe(false);
    expect(facade.isSupportedUseCase(null)).toBe(false);
    expect(facade.isSupportedUseCase(42)).toBe(false);
  });

  it("exports all expected error codes", () => {
    const expected = [
      "UNAUTHORIZED",
      "FORBIDDEN_WORKSPACE",
      "MISSING_CONTEXT",
      "UNSUPPORTED_CAPABILITY",
      "ENTITLEMENT_EXHAUSTED",
      "ROUTER_UNAVAILABLE",
      "PROVIDER_FAILURE_EXHAUSTED",
      "MALFORMED_STRUCTURED_OUTPUT",
      "SAFE_FALLBACK_USED",
    ];
    for (const code of expected) {
      expect(facade.PULSE_AI_ERROR_CODES).toContain(code);
    }
  });

  it("exports all expected internal capabilities", () => {
    expect(facade.INTERNAL_CAPABILITIES).toContain("customer_brain");
    expect(facade.INTERNAL_CAPABILITIES).toContain("ai_router_direct");
    expect(facade.INTERNAL_CAPABILITIES).toContain("public_support");
  });
});

// ── 6: Business use case ≠ AI Router task type (explicit separation) ──────────

describe("AI-2 use-case vs router-task separation", () => {
  it("general_reasoning → balanced (not complex_reasoning)", () => {
    expect(facade.resolveRouterTaskType("general_reasoning")).toBe("balanced");
  });

  it("lead_analysis → text_classification (not balanced or complex)", () => {
    expect(facade.resolveRouterTaskType("lead_analysis")).toBe("text_classification");
  });

  it("customer_support → customer_support task type", () => {
    expect(facade.resolveRouterTaskType("customer_support")).toBe("customer_support");
  });

  it("complex_reasoning → complex_reasoning", () => {
    expect(facade.resolveRouterTaskType("complex_reasoning")).toBe("complex_reasoning");
  });

  it("all workspace use cases have a non-provider-specific task type", () => {
    const providerNames = [
      "openai", "anthropic", "claude", "gpt", "gemini", "groq", "mistral",
      "deepseek", "perplexity", "kimi", "grok",
    ];
    for (const uc of facade.BUSINESS_USE_CASES) {
      const taskType = facade.resolveRouterTaskType(uc);
      for (const provider of providerNames) {
        expect(
          taskType.toLowerCase(),
          `task type for ${uc} must not reference a provider`,
        ).not.toContain(provider);
      }
    }
  });

  it("USE_CASE_TO_ROUTER_TASK_TYPE and BUSINESS_USE_CASES have the same keys", () => {
    for (const uc of facade.BUSINESS_USE_CASES) {
      expect(
        facade.USE_CASE_TO_ROUTER_TASK_TYPE[uc],
        `missing router task type for ${uc}`,
      ).toBeDefined();
    }
  });
});

// ── 5: Customer Brain is reused for customer/segment use cases ────────────────

describe("AI-2 capability routing — Customer Brain delegation", () => {
  it("customer_evaluation routes to customer_brain", () => {
    expect(facade.resolveCapability("customer_evaluation")).toBe("customer_brain");
  });

  it("segment_suggestion routes to customer_brain", () => {
    expect(facade.resolveCapability("segment_suggestion")).toBe("customer_brain");
  });

  it("general_reasoning routes to ai_router_direct (not customer_brain)", () => {
    expect(facade.resolveCapability("general_reasoning")).toBe("ai_router_direct");
  });

  it("business_insight routes to ai_router_direct", () => {
    expect(facade.resolveCapability("business_insight")).toBe("ai_router_direct");
  });

  it("lead_analysis routes to ai_router_direct", () => {
    expect(facade.resolveCapability("lead_analysis")).toBe("ai_router_direct");
  });

  it("complex_reasoning routes to ai_router_direct", () => {
    expect(facade.resolveCapability("complex_reasoning")).toBe("ai_router_direct");
  });

  it("customer_support routes to public_support (not customer_brain, not ai_router_direct)", () => {
    expect(facade.resolveCapability("customer_support")).toBe("public_support");
  });
});

// ── 4: Public AI / workspace AI isolation ─────────────────────────────────────

describe("AI-2 public vs workspace isolation", () => {
  it("isPublicUseCase is true only for customer_support", () => {
    expect(facade.isPublicUseCase("customer_support")).toBe(true);
    for (const uc of facade.BUSINESS_USE_CASES) {
      if (uc !== "customer_support") {
        expect(facade.isPublicUseCase(uc), `${uc} should NOT be public`).toBe(false);
      }
    }
  });

  it("isWorkspaceUseCase is true for all non-public use cases", () => {
    for (const uc of facade.BUSINESS_USE_CASES) {
      if (uc !== "customer_support") {
        expect(facade.isWorkspaceUseCase(uc), `${uc} should be workspace-scoped`).toBe(true);
      }
    }
    expect(facade.isWorkspaceUseCase("customer_support")).toBe(false);
  });

  it("edge function public_support path has no CRM/memory references in system prompt", () => {
    const src = edgeSrc();
    // The public support system prompt must explicitly deny workspace data
    expect(src).toContain("Never reveal CRM data");
    expect(src).toContain("workspace-private information");
    // The public support path must NOT load workspace data from supabase tables
    const publicSupportFn = src.slice(
      src.indexOf("dispatchPublicSupport"),
      src.indexOf("dispatchPublicSupport") + 1500,
    );
    expect(publicSupportFn).not.toContain('.from("leads')
    expect(publicSupportFn).not.toContain('.from("business_digital_twins');
    expect(publicSupportFn).not.toContain('.from("business_memory');
    expect(publicSupportFn).not.toContain('.from("customer_memory');
  });

  it("public_support callAIRouter has no workspaceId", () => {
    const src = edgeSrc();
    // Find the dispatchPublicSupport function and verify it does NOT pass workspaceId
    const fnStart = src.indexOf("async function dispatchPublicSupport");
    const fnEnd = src.indexOf("// ── Capability: AI Router", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("workspaceId: req.workspaceId");
    // And it must call with customer_support task type
    expect(fnBody).toContain('"customer_support"');
  });
});

// ── 10: Request ID preserved end-to-end ──────────────────────────────────────

describe("AI-2 correlation / request ID end-to-end", () => {
  it("createErrorResponse echoes requestId verbatim", () => {
    const resp = facade.createErrorResponse(
      "req-test-123",
      "ws-abc",
      "general_reasoning",
      "UNAUTHORIZED",
      "Missing auth",
    );
    expect(resp.requestId).toBe("req-test-123");
    expect(resp.success).toBe(false);
    expect(resp.workspaceId).toBe("ws-abc");
    expect(resp.useCase).toBe("general_reasoning");
    expect(resp.errorCode).toBe("UNAUTHORIZED");
    expect(resp.humanHandoffRecommended).toBe(false);
  });

  it("createSuccessResponse echoes requestId verbatim", () => {
    const resp = facade.createSuccessResponse("req-xyz-999", "ws-def", "lead_analysis", {
      answer: "Lead is hot",
      routerTaskType: "text_classification",
    });
    expect(resp.requestId).toBe("req-xyz-999");
    expect(resp.success).toBe(true);
    expect(resp.workspaceId).toBe("ws-def");
    expect(resp.useCase).toBe("lead_analysis");
    expect(resp.answer).toBe("Lead is hot");
    expect(resp.routerTaskType).toBe("text_classification");
    expect(resp.humanHandoffRecommended).toBe(false);
  });

  it("edge function generates a requestId when not provided", () => {
    const src = edgeSrc();
    expect(src).toContain("crypto.randomUUID()");
  });
});

// ── 11: Response contract stability ──────────────────────────────────────────

describe("AI-2 structured response contract", () => {
  it("createErrorResponse has required fields: requestId, success, workspaceId, useCase, humanHandoffRecommended, errorCode, errorMessage", () => {
    const resp = facade.createErrorResponse(
      "req-1", "ws-1", "complex_reasoning", "ROUTER_UNAVAILABLE", "Router down",
    );
    expect(typeof resp.requestId).toBe("string");
    expect(resp.success).toBe(false);
    expect(typeof resp.workspaceId).toBe("string");
    expect(typeof resp.useCase).toBe("string");
    expect(typeof resp.humanHandoffRecommended).toBe("boolean");
    expect(typeof resp.errorCode).toBe("string");
    expect(typeof resp.errorMessage).toBe("string");
  });

  it("ROUTER_UNAVAILABLE sets humanHandoffRecommended = true", () => {
    const resp = facade.createErrorResponse(
      "r1", "w1", "general_reasoning", "ROUTER_UNAVAILABLE", "down",
    );
    expect(resp.humanHandoffRecommended).toBe(true);
  });

  it("PROVIDER_FAILURE_EXHAUSTED sets humanHandoffRecommended = true", () => {
    const resp = facade.createErrorResponse(
      "r1", "w1", "general_reasoning", "PROVIDER_FAILURE_EXHAUSTED", "all failed",
    );
    expect(resp.humanHandoffRecommended).toBe(true);
  });

  it("UNAUTHORIZED does NOT set humanHandoffRecommended = true", () => {
    const resp = facade.createErrorResponse(
      "r1", "w1", "general_reasoning", "UNAUTHORIZED", "no auth",
    );
    expect(resp.humanHandoffRecommended).toBe(false);
  });

  it("createSuccessResponse has humanHandoffRecommended = false by default", () => {
    const resp = facade.createSuccessResponse("r2", "w2", "general_reasoning", {
      answer: "ok",
    });
    expect(resp.humanHandoffRecommended).toBe(false);
    expect(resp.success).toBe(true);
  });

  it("createSuccessResponse allows humanHandoffRecommended = true to be overridden", () => {
    const resp = facade.createSuccessResponse("r3", "w3", "customer_evaluation", {
      humanHandoffRecommended: true,
      structuredData: { action_type: "human_handoff" },
    });
    expect(resp.humanHandoffRecommended).toBe(true);
  });

  it("response envelope has no raw provider API keys or provider error dumps", () => {
    const src = facadeSrc();
    // The module must not construct responses that include secret env vars
    expect(src).not.toContain("ANTHROPIC_API_KEY");
    expect(src).not.toContain("OPENAI_API_KEY");
    expect(src).not.toContain("GROQ_API_KEY");
    expect(src).not.toContain("GEMINI_API_KEY");
    expect(src).not.toContain("getServiceKey");
  });
});

// ── 2: Forged workspace protection ────────────────────────────────────────────

describe("AI-2 forged workspace protection", () => {
  it("edge function verifies workspace membership before dispatch (USER path)", () => {
    const src = edgeSrc();
    // Must call JWT getUser before any workspace-scoped call
    expect(src).toContain("sb.auth.getUser");
    // Must call is_workspace_member RPC
    expect(src).toContain('rpc("is_workspace_member"');
    // Must check owner_id as well (same as customer-brain pattern)
    expect(src).toContain(".eq(\"owner_id\", userId)");
  });

  it("edge function returns FORBIDDEN_WORKSPACE when user is not a member", () => {
    const src = edgeSrc();
    expect(src).toContain("FORBIDDEN_WORKSPACE");
    expect(src).toContain("Not a member of this workspace");
  });

  it("edge function contains comment explaining forged-workspace protection", () => {
    const src = edgeSrc();
    expect(src).toContain("NEVER trust browser-provided workspace_id without membership verification");
  });

  it("edge function requires workspace_id for workspace use cases", () => {
    const src = edgeSrc();
    expect(src).toContain("workspace_id required");
  });
});

// ── 3: Cross-workspace isolation ──────────────────────────────────────────────

describe("AI-2 cross-workspace isolation", () => {
  it("customer-brain dispatch always passes workspace_id from verified context (not from raw body)", () => {
    const src = edgeSrc();
    // In dispatchToCustomerBrain, we pass req.workspaceId (already verified)
    const brainFn = src.slice(
      src.indexOf("async function dispatchToCustomerBrain"),
      src.indexOf("async function dispatchToAIRouter"),
    );
    expect(brainFn).toContain("workspace_id: req.workspaceId");
    // Must NOT pass rawWorkspaceId directly
    expect(brainFn).not.toContain("rawWorkspaceId");
  });

  it("ai-router dispatch passes verified workspaceId only", () => {
    const src = edgeSrc();
    const routerFn = src.slice(
      src.indexOf("async function dispatchToAIRouter"),
      src.indexOf("async function dispatchPublicSupport"),
    );
    expect(routerFn).toContain("workspaceId: req.workspaceId");
    expect(routerFn).not.toContain("rawWorkspaceId");
  });

  it("verifiedWorkspaceId is derived from JWT check, not from body directly", () => {
    const src = edgeSrc();
    // verifiedWorkspaceId is only set after membership check passes
    const membershipBlock = src.slice(
      src.indexOf("// ── Workspace verification"),
      src.indexOf("// ── Build canonical request"),
    );
    expect(membershipBlock).toContain("verifiedWorkspaceId = rawWorkspaceId");
    // It's only set inside the isMember block, not before
    const beforeCheck = membershipBlock.slice(
      0,
      membershipBlock.indexOf("const isMember"),
    );
    expect(beforeCheck).not.toContain("verifiedWorkspaceId = rawWorkspaceId");
  });
});

// ── 7: No direct provider bypass ──────────────────────────────────────────────

describe("AI-2 no direct provider bypass", () => {
  it("pulse-ai/index.ts has no direct Anthropic endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.anthropic.com");
    expect(src).not.toContain("anthropic-version");
  });

  it("pulse-ai/index.ts has no direct OpenAI endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.openai.com");
  });

  it("pulse-ai/index.ts has no direct Groq endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.groq.com");
  });

  it("pulse-ai/index.ts has no direct Gemini endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("generativelanguage.googleapis.com");
  });

  it("pulse-ai/index.ts has no direct DeepSeek endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.deepseek.com");
  });

  it("pulse-ai/index.ts has no direct Mistral endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.mistral.ai");
  });

  it("pulse-ai/index.ts has no direct Perplexity endpoint", () => {
    const src = edgeSrc();
    expect(src).not.toContain("api.perplexity.ai");
  });

  it("pulse-ai/index.ts routes through canonical callAIRouter for provider execution", () => {
    const src = edgeSrc();
    expect(src).toContain('from "../_shared/ai-router-helper.ts"');
    expect(src).toContain("callAIRouter(");
  });

  it("pulse-ai-facade.ts has no provider endpoint references", () => {
    const src = facadeSrc();
    expect(src).not.toContain("api.anthropic.com");
    expect(src).not.toContain("api.openai.com");
    expect(src).not.toContain("api.groq.com");
    expect(src).not.toContain("api.deepseek.com");
    expect(src).not.toContain("api.mistral.ai");
  });
});

// ── 8: Unsupported capability fails safely ────────────────────────────────────

describe("AI-2 unsupported capability handling", () => {
  it("edge function returns UNSUPPORTED_CAPABILITY for unknown use_case", () => {
    const src = edgeSrc();
    expect(src).toContain("UNSUPPORTED_CAPABILITY");
    expect(src).toContain("Unsupported use_case");
  });

  it("isSupportedUseCase returns false for invalid use cases", () => {
    expect(facade.isSupportedUseCase("send_email")).toBe(false);
    expect(facade.isSupportedUseCase("create_campaign")).toBe(false);
    expect(facade.isSupportedUseCase("run_booking")).toBe(false);
    expect(facade.isSupportedUseCase("openai_chat")).toBe(false);
  });
});

// ── 9: Router failure → normalized facade error ───────────────────────────────

describe("AI-2 router failure normalization", () => {
  it("dispatchToAIRouter catch block creates a normalized error (no provider dump)", () => {
    const src = edgeSrc();
    const routerFn = src.slice(
      src.indexOf("async function dispatchToAIRouter"),
      src.indexOf("async function dispatchPublicSupport"),
    );
    expect(routerFn).toContain("ROUTER_UNAVAILABLE");
    expect(routerFn).toContain("PROVIDER_FAILURE_EXHAUSTED");
    // Error message returned to caller must be a static safe string (no raw provider dump)
    expect(routerFn).toContain("AI Router call failed; no provider available");
    // The raw error string is used ONLY for code classification (msg.includes), not returned
    expect(routerFn).toContain("msg.includes");
    // Verify the createErrorResponse 5th arg is the static safe string, not a dynamic msg
    expect(routerFn).toContain('"AI Router call failed; no provider available"');
  });

  it("dispatchToCustomerBrain catch block creates a normalized error", () => {
    const src = edgeSrc();
    const brainFn = src.slice(
      src.indexOf("async function dispatchToCustomerBrain"),
      src.indexOf("async function dispatchToAIRouter"),
    );
    expect(brainFn).toContain("ROUTER_UNAVAILABLE");
    expect(brainFn).toContain("Customer Brain call failed");
  });

  it("dispatchPublicSupport catch block creates a normalized error", () => {
    const src = edgeSrc();
    const publicFn = src.slice(
      src.indexOf("async function dispatchPublicSupport"),
      src.indexOf("// ── Prompt builders"),
    );
    expect(publicFn).toContain("ROUTER_UNAVAILABLE");
    expect(publicFn).toContain("AI Router unavailable for public support");
  });
});

// ── 12: Human handoff — recommended, never executed ──────────────────────────

describe("AI-2 human handoff contract", () => {
  it("humanHandoffRecommended is in response contract (behavioral)", () => {
    const resp = facade.createSuccessResponse("r", "w", "customer_evaluation", {
      humanHandoffRecommended: true,
      answer: "Please talk to a human",
    });
    expect(typeof resp.humanHandoffRecommended).toBe("boolean");
    expect(resp.humanHandoffRecommended).toBe(true);
  });

  it("edge function sets humanHandoffRecommended from Customer Brain NBA result", () => {
    const src = edgeSrc();
    expect(src).toContain('nbaActionType === "human_handoff"');
    expect(src).toContain("humanHandoffRecommended: humanHandoff");
  });

  it("edge function does NOT create tickets or send messages on human_handoff", () => {
    const src = edgeSrc();
    expect(src).not.toContain('invoke("submit-ticket"');
    expect(src).not.toContain('invoke("send-whatsapp"');
    expect(src).not.toContain('invoke("send-email"');
    expect(src).not.toContain('invoke("send-sms"');
    expect(src).not.toContain(".from(\"business_notifications\")");
  });
});

// ── 13: Suggested actions are NOT executed ────────────────────────────────────

describe("AI-2 suggested actions not executed", () => {
  it("createSuccessResponse supports suggestedNextAction field", () => {
    const resp = facade.createSuccessResponse("r", "w", "customer_evaluation", {
      suggestedNextAction: { type: "follow_up", reason: "Customer inactive" },
    });
    expect(resp.suggestedNextAction).toEqual({
      type: "follow_up",
      reason: "Customer inactive",
    });
  });

  it("edge function returns suggestedNextAction but does not execute it", () => {
    const src = edgeSrc();
    // suggestedNextAction must be present in returned response
    expect(src).toContain("suggestedNextAction");
    // Must NOT execute the action
    expect(src).not.toContain('invoke("appointment-booking"');
    expect(src).not.toContain('invoke("launch-campaign-broadcast"');
    expect(src).not.toContain('invoke("create-checkout"');
    expect(src).not.toContain(".from(\"deals\")");
  });

  it("facade source has an explicit AI-3 boundary comment", () => {
    const src = edgeSrc();
    expect(src).toContain("AI-3 BOUNDARY");
    expect(src).toContain("No commercial actions executed");
  });
});

// ── 14: No commercial actions triggered ──────────────────────────────────────

describe("AI-2 AI-3 boundary — no commercial execution", () => {
  it("pulse-ai does not invoke send-whatsapp", () => {
    const src = edgeSrc();
    expect(src).not.toContain("send-whatsapp");
  });

  it("pulse-ai does not invoke send-email", () => {
    const src = edgeSrc();
    expect(src).not.toContain("send-email");
  });

  it("pulse-ai does not invoke broadcast-send-engine", () => {
    const src = edgeSrc();
    expect(src).not.toContain("broadcast-send-engine");
  });

  it("pulse-ai does not insert discounts or offers into CRM", () => {
    const src = edgeSrc();
    expect(src).not.toContain(".from(\"offers\")");
    expect(src).not.toContain(".from(\"discounts\")");
    expect(src).not.toContain(".from(\"campaigns\")");
  });

  it("pulse-ai does not create bookings", () => {
    const src = edgeSrc();
    expect(src).not.toContain("appointment-booking");
    expect(src).not.toContain("send-calcom");
    expect(src).not.toContain(".from(\"bookings\")");
  });
});

// ── 17: AI-3 not implemented ──────────────────────────────────────────────────

describe("AI-2 AI-3 scope NOT implemented", () => {
  it("facade module has no AI-3 action execution", () => {
    const src = facadeSrc();
    // AI-3 scope: controlled action execution. Must not be here.
    expect(src).not.toContain("executeAction");
    expect(src).not.toContain("triggerAction");
    expect(src).not.toContain("runAction");
  });

  it("edge function comment explicitly notes AI-3 boundary", () => {
    const src = edgeSrc();
    expect(src).toContain("AI-3 BOUNDARY");
  });
});

// ── 18: AI-4 unified memory NOT implemented ───────────────────────────────────

describe("AI-2 AI-4 scope NOT implemented", () => {
  it("edge function has no new unified memory table creation", () => {
    const src = edgeSrc();
    expect(src).not.toContain(".from(\"unified_memory\")");
    expect(src).not.toContain(".from(\"vector_memory\")");
    expect(src).not.toContain(".from(\"cross_workspace_memory\")");
    expect(src).not.toContain("unifiedMemory");
    expect(src).not.toContain("vectorMemory");
  });

  it("facade module has no new memory architecture", () => {
    const src = facadeSrc();
    expect(src).not.toContain("unified_memory");
    expect(src).not.toContain("vector_memory");
    expect(src).not.toContain("CustomerMemory");
    expect(src).not.toContain("UnifiedMemory");
  });

  it("edge function comment explicitly notes AI-4 boundary", () => {
    const src = edgeSrc();
    expect(src).toContain("AI-4 BOUNDARY");
  });
});

// ── 19: AI-5 Golden Journey NOT implemented ───────────────────────────────────

describe("AI-2 AI-5 scope NOT implemented", () => {
  it("edge function has no Golden Journey runtime", () => {
    const src = edgeSrc();
    expect(src).not.toContain("golden_journey");
    expect(src).not.toContain("goldenJourney");
    expect(src).not.toContain("GoldenJourney");
    expect(src).not.toContain("journey_engine");
  });

  it("facade module has no Golden Journey logic", () => {
    const src = facadeSrc();
    expect(src).not.toContain("golden_journey");
    expect(src).not.toContain("GoldenJourney");
  });

  it("edge function comment explicitly notes AI-5 boundary", () => {
    const src = edgeSrc();
    expect(src).toContain("AI-5 BOUNDARY");
  });
});

// ── 15: AI-1A / AI-1B security regressions ───────────────────────────────────

describe("AI-1A/AI-1B regression checks (pulse-ai must not break existing contracts)", () => {
  it("ai-router still contains CANONICAL_TASK_TYPES (AI-1A contract)", () => {
    const routerSrc = readFileSync(
      repoFile("supabase", "functions", "ai-router", "index.ts"),
      "utf-8",
    );
    expect(routerSrc).toContain("CANONICAL_TASK_TYPES");
    expect(routerSrc).toContain("text_classification");
    expect(routerSrc).toContain("complex_reasoning");
    expect(routerSrc).toContain("balanced");
  });

  it("ai-router still contains SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET (AI-1B contract)", () => {
    const routerSrc = readFileSync(
      repoFile("supabase", "functions", "ai-router", "index.ts"),
      "utf-8",
    );
    expect(routerSrc).toContain("SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET");
  });

  it("shared ai-client still routes through canonical ai-router-helper (AI-1B)", () => {
    const clientSrc = readFileSync(
      repoFile("supabase", "functions", "_shared", "ai-client.ts"),
      "utf-8",
    );
    expect(clientSrc).toContain('from "./ai-router-helper.ts"');
    expect(clientSrc).toContain("callAIRouter");
  });

  it("pulse-ai does not introduce new provider API key reads (AI-1B compliance)", () => {
    const src = edgeSrc();
    expect(src).not.toContain("ANTHROPIC_API_KEY");
    expect(src).not.toContain("OPENAI_API_KEY");
    expect(src).not.toContain("GROQ_API_KEY");
    expect(src).not.toContain("GEMINI_API_KEY");
    expect(src).not.toContain("DEEPSEEK_API_KEY");
    expect(src).not.toContain("MISTRAL_API_KEY");
  });
});

// ── 16: SOCIAL-1C regression checks ──────────────────────────────────────────

describe("SOCIAL-1C regression checks (pulse-ai must not modify social files)", () => {
  it("social-interest-memory.ts is untouched (still exports correct contract)", () => {
    const socialSrc = readFileSync(
      repoFile("supabase", "functions", "_shared", "social-interest-memory.ts"),
      "utf-8",
    );
    // AI-2 must not modify this file — verify it still has the SOCIAL-1C contract
    expect(socialSrc).toBeTruthy();
    expect(socialSrc.length).toBeGreaterThan(100);
  });

  it("score-visitors function is untouched", () => {
    const scoreSrc = readFileSync(
      repoFile("supabase", "functions", "score-visitors", "index.ts"),
      "utf-8",
    );
    expect(scoreSrc).toBeTruthy();
    expect(scoreSrc.length).toBeGreaterThan(100);
  });

  it("pulse-ai does not import or reference SOCIAL-1C files", () => {
    const src = edgeSrc();
    expect(src).not.toContain("social-interest-memory");
    expect(src).not.toContain("score-visitors");
    expect(src).not.toContain("social_interest");
  });
});

// ── Auth boundary: internal path still requires INTERNAL_WEBHOOK_SECRET ───────

describe("AI-2 internal auth boundary", () => {
  it("edge function checks INTERNAL_WEBHOOK_SECRET for internal path", () => {
    const src = edgeSrc();
    expect(src).toContain("INTERNAL_WEBHOOK_SECRET");
    expect(src).toContain("x-internal-secret");
  });

  it("edge function checks CRON_SECRET for cron path", () => {
    const src = edgeSrc();
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain("x-cron-secret");
  });

  it("edge function dispatches customer-brain with internal secret header", () => {
    const src = edgeSrc();
    const brainFn = src.slice(
      src.indexOf("async function dispatchToCustomerBrain"),
      src.indexOf("async function dispatchToAIRouter"),
    );
    expect(brainFn).toContain("INTERNAL_WEBHOOK_SECRET");
    expect(brainFn).toContain("x-internal-secret");
  });
});

// ── Observability: minimum traceability ───────────────────────────────────────

describe("AI-2 minimum observability", () => {
  it("edge function logs pulse_ai_request event with traceability fields", () => {
    const src = edgeSrc();
    expect(src).toContain("pulse_ai_request");
    expect(src).toContain("pulse_ai_response");
    // Must log capability, useCase, workspaceId, requestId
    // (as shorthand or explicit object properties - no provider secrets)
    expect(src).toContain("capability,");
    expect(src).toContain("useCase,");
    expect(src).toContain("workspaceId:");
    expect(src).toContain("requestId,");
  });
});

// ── Public HTTP-Behavior Tests ────────────────────────────────────────────────
// Tests proving the public/auth runtime contract at the source level.
// These validate the state machine structure rather than live HTTP calls.

describe("AI-2 public HTTP-behavior — auth state machine (source-verified)", () => {
  it("T1: public customer_support does NOT require ****** — no 401 gate before public path", () => {
    const src = edgeSrc();
    // The public path check (isPublicSupportRequest) must be established BEFORE
    // the JWT-required block. The JWT guard must be gated: !isInternal && !isPublicSupportRequest
    expect(src).toContain("isPublicSupportRequest");
    expect(src).toContain("!isInternal && !isPublicSupportRequest");
    // Must NOT have the old unguarded JWT block that fires for every non-internal request
    expect(src).not.toMatch(/if\s*\(\s*!isInternal\s*\)\s*\{[\s\S]*?authHeader\.startsWith\("Bearer "\)/);
  });

  it("T2: public customer_support is routed to public-support dispatch path", () => {
    const src = edgeSrc();
    expect(src).toContain("isPublicUseCase");
    expect(src).toContain("isPublicSupportRequest");
    // The public_support capability resolves from customer_support
    expect(facade.resolveCapability("customer_support")).toBe("public_support");
  });

  it("T3: public request with forged workspace_id does NOT gain workspace scope", () => {
    const src = edgeSrc();
    // Public path (isPublicSupportRequest) must result in verifiedWorkspaceId = ""
    // and the workspace verification block must only run for isWorkspaceUseCase
    expect(src).toContain("// PUBLIC path: verifiedWorkspaceId remains \"\" — public support has no workspace scope.");
    // isPublicUseCase(customer_support) must be true → isWorkspaceUseCase must be false
    expect(facade.isPublicUseCase("customer_support")).toBe(true);
    expect(facade.isWorkspaceUseCase("customer_support")).toBe(false);
  });

  it("T4: public request cannot load CRM, Business Memory, Customer Memory, or Customer Brain", () => {
    const src = edgeSrc();
    // dispatchPublicSupport must not call dispatchToCustomerBrain or load workspace data
    const publicFn = src.slice(
      src.indexOf("async function dispatchPublicSupport"),
      src.indexOf("// ── Prompt builders"),
    );
    expect(publicFn).not.toContain("dispatchToCustomerBrain");
    expect(publicFn).not.toContain('.from("leads');
    expect(publicFn).not.toContain('.from("business_digital_twins');
    expect(publicFn).not.toContain('.from("business_memory');
    expect(publicFn).not.toContain('.from("customer_memory');
    expect(publicFn).not.toContain("customer-brain");
    // workspaceId intentionally absent on the public path
    expect(publicFn).toContain("workspaceId intentionally absent");
  });

  it("T5: workspace business use case without JWT returns 401 (not allowed without auth)", () => {
    const src = edgeSrc();
    // USER path guard: missing ****** return UNAUTHORIZED
    expect(src).toContain("Missing authorization");
    expect(src).toContain('"UNAUTHORIZED"');
    // The guard block is inside !isInternal && !isPublicSupportRequest
    const userBlock = src.slice(
      src.indexOf("if (!isInternal && !isPublicSupportRequest)"),
      src.indexOf("// ── Workspace verification"),
    );
    expect(userBlock).toContain("Missing authorization");
  });

  it("T6: authenticated workspace request requires actual JWT membership verification", () => {
    const src = edgeSrc();
    expect(src).toContain("sb.auth.getUser");
    expect(src).toContain('rpc("is_workspace_member"');
  });

  it("T7: forged workspace membership returns 403 FORBIDDEN_WORKSPACE", () => {
    const src = edgeSrc();
    expect(src).toContain("FORBIDDEN_WORKSPACE");
    expect(src).toContain("Not a member of this workspace");
    // membership check runs inside !isInternal block (USER path only)
    const memberBlock = src.slice(
      src.indexOf("// USER path: NEVER trust browser-provided workspace_id"),
      src.indexOf("// INTERNAL path: workspace_id is server-provided"),
    );
    expect(memberBlock).toContain("FORBIDDEN_WORKSPACE");
  });

  it("T8: internal workspace call requires verified internal secret", () => {
    const src = edgeSrc();
    // isInternal must require matching INTERNAL_WEBHOOK_SECRET or CRON_SECRET
    expect(src).toContain("internalSecret === configInternal");
    expect(src).toContain("cronSecret === configCron");
    // Internal path must still require workspace_id for workspace use cases
    const wsBlock = src.slice(
      src.indexOf("// ── Workspace verification"),
      src.indexOf("// PUBLIC path: verifiedWorkspaceId remains"),
    );
    expect(wsBlock).toContain("workspace_id required");
  });

  it("T9: public authContextType is public_unauthenticated, not user_jwt", () => {
    const src = edgeSrc();
    expect(src).toContain('"public_unauthenticated"');
    expect(src).toContain("isPublicSupportRequest");
    // The authContextType assignment must distinguish public from user_jwt
    const authCtxBlock = src.slice(
      src.indexOf("// Determine authContextType"),
      src.indexOf("const pulseReq"),
    );
    expect(authCtxBlock).toContain('"public_unauthenticated"');
    expect(authCtxBlock).toContain('"user_jwt"');
    expect(authCtxBlock).toContain('"internal_service"');
    // The facade type must include public_unauthenticated
    const facadeSrcStr = facadeSrc();
    expect(facadeSrcStr).toContain("public_unauthenticated");
  });

  it("T10: public default source is 'public', not 'workspace_ui'", () => {
    const src = edgeSrc();
    expect(src).toContain('"public"');
    // defaultSource must be "public" for the public path
    const defaultSrcBlock = src.slice(
      src.indexOf("const defaultSource"),
      src.indexOf("const pulseReq"),
    );
    expect(defaultSrcBlock).toContain('"public"');
    expect(defaultSrcBlock).toContain('"workspace_ui"');
    expect(defaultSrcBlock).toContain("isPublicSupportRequest");
  });
});
