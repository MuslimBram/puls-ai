import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("AI-1A2 Public AI Help Bot Consolidation", () => {
  it("removes direct Frontend Builder gateway/provider bypass and routes through canonical ai-router", () => {
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    expect(helpBot).not.toContain("LOVABLE_API_KEY");
    expect(helpBot).not.toContain("ai.gateway.frontend_builder.dev");
    expect(helpBot).not.toContain("gemini-3-flash-preview");

    expect(helpBot).toContain("/functions/v1/ai-router");
    expect(helpBot).toContain('const ROUTER_TASK_TYPE = "customer_support"');
    expect(helpBot).toContain("INTERNAL_WEBHOOK_SECRET");
    expect(helpBot).toContain("getServiceKey()");
  });

  it("removes stale hardcoded commercial claims and uses pricing_settings as pricing truth source", () => {
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    expect(helpBot).not.toContain("START (€29/month)");
    expect(helpBot).not.toContain("GROWTH (€79/month)");
    expect(helpBot).not.toContain("PRO (€149/month)");
    expect(helpBot).not.toContain("ENTERPRISE (€399+/month)");
    expect(helpBot).not.toContain("Business referrals: 15% lifetime commission");
    expect(helpBot).not.toContain("Freelancer referrals: 20% lifetime commission");
    expect(helpBot).not.toContain("Duration discounts: monthly 0%, 3-month 5%, 6-month 10%, yearly 15%");
    expect(helpBot).not.toContain("7-day free trial");
    expect(helpBot).not.toContain("Reply in English");

    expect(helpBot).toContain('.from("pricing_settings")');
    expect(helpBot).toContain('.eq("is_public", true)');
    expect(helpBot).toContain('"Pricing source is unavailable; do not provide numeric prices. Direct users to the current /pricing page for exact current prices."');
  });

  it("keeps router auth boundaries while allowing safe internal no-workspace customer_support calls", () => {
    const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

    expect(router).toContain("SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET");
    expect(router).toContain("await supabase.auth.getUser(bearerToken)");
    expect(router).toContain('rpc("is_workspace_member"');

    expect(router).toContain("allowInternalNoWorkspaceCustomerSupport");
    expect(router).toContain('normalizedTaskType === "customer_support"');
    expect(router).toContain("if (!authorizedWorkspaceId && !allowInternalNoWorkspaceCustomerSupport)");
  });

  it("fails malformed message payloads safely and preserves frontend escalation contract", () => {
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    expect(helpBot).toContain("Invalid payload: messages must be an array");
    expect(helpBot).toContain("Invalid payload: unsupported message role");
    expect(helpBot).toContain("Invalid payload: message content is required");
    expect(helpBot).toContain("Invalid payload: at least one message is required");
    expect(helpBot).toContain("const needs_admin = shouldEscalate");
    expect(helpBot).toContain("return new Response(JSON.stringify({ reply, needs_admin })");
  });

  it("authenticated escalation invokes submit-ticket Edge Function, not a direct business_notifications insert", () => {
    const floatingBot = readFileSync(repoFile("src", "components", "FloatingAIBot.tsx"), "utf-8");

    // Must route through the existing submit-ticket function
    expect(floatingBot).toContain('supabase.functions.invoke("submit-ticket"');
    // Must NOT insert directly into business_notifications (which uses caller's user_id, not admin IDs)
    expect(floatingBot).not.toContain('.from("business_notifications"');

    // Anonymous path: no false "specialist notified" claim
    expect(floatingBot).toContain("For account-specific or unresolved issues, please sign in and open Helpdesk so our team can assist you.");
    // Authenticated path: success message only on actual ticket creation success
    expect(floatingBot).toContain("A specialist has been notified and will connect with you shortly. Feel free to keep chatting in the meantime.");
    // Authenticated path: truthful fallback on failure
    expect(floatingBot).toContain("I couldn't notify a specialist automatically. Please open Helpdesk from your workspace while we continue here.");

    // Duplicate-ticket prevention: adminNotified state guard
    expect(floatingBot).toContain("if (adminNotified || !user?.id) return false;");
    expect(floatingBot).toContain("setAdminNotified(true);");
  });

  it("shouldEscalate: generic product/pricing/security questions do NOT escalate", () => {
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    // The tightened shouldEscalate must not contain generic single-word triggers
    // that would match product FAQ questions
    expect(helpBot).not.toMatch(/\\b\(.*?\bcrm\b.*?\)\.test\(lastUserMessage\)/);
    expect(helpBot).not.toMatch(/\\b\(.*?\bsubscription\b.*?\)\.test\(lastUserMessage\)/);
    expect(helpBot).not.toMatch(/\\b\(.*?\bgdpr\b.*?\)\.test\(lastUserMessage\)/);

    // Regression: the old broad accountOrBilling pattern must be gone
    expect(helpBot).not.toContain("const accountOrBilling");
    expect(helpBot).not.toContain("const securitySensitive");
  });

  it("shouldEscalate: user-specific incidents escalate; generic FAQ questions do not", () => {
    // Extract shouldEscalate function body from source for unit-testing its logic
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    // Confirm deterministic escalation patterns are present
    expect(helpBot).toContain("humanRequested");
    expect(helpBot).toContain("userAccountAccessProblem");
    expect(helpBot).toContain("userBillingIncident");
    expect(helpBot).toContain("userSecurityIncident");
    expect(helpBot).toContain("unresolvedTechnical");
    expect(helpBot).toContain("unresolvedByAi");

    // --- Regression examples: these must NOT trigger escalation ---
    // These are generic product/FAQ questions that Public AI Help should answer
    const noEscalateInputs = [
      "Does Pulse AI have CRM?",
      "What subscription plans do you offer?",
      "How does pricing work?",
      "What security features does Pulse AI have?",
      "Do you support GDPR requirements?",
    ];

    // Extract the shouldEscalate function as evaluable JS for regression testing
    const fnMatch = helpBot.match(/function shouldEscalate[\s\S]+?^}/m);
    expect(fnMatch).not.toBeNull();
    const fnSrc = fnMatch![0]
      .replace(/\.test\(lastUserMessage\)/g, ".test(lastUserMsg)")
      .replace(/\.test\(reply\)/g, ".test(aiReply)");

    const shouldEscalateFn = new Function(
      "messages",
      "aiReply",
      `
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content.toLowerCase() ?? "";
      ${fnSrc.replace(/^function shouldEscalate[^{]+\{/, "").replace(/\}$/, "")}
      `,
    ) as (messages: Array<{ role: string; content: string }>, aiReply: string) => boolean;

    for (const q of noEscalateInputs) {
      const result = shouldEscalateFn([{ role: "user", content: q }], "Here is information about that feature.");
      expect(result, `"${q}" should NOT escalate`).toBe(false);
    }

    // --- Regression examples: these MUST trigger escalation ---
    const escalateInputs = [
      "I was charged twice.",
      "I cannot log into my account.",
      "I think my account was hacked.",
      "I want to speak to a human.",
    ];

    for (const q of escalateInputs) {
      const result = shouldEscalateFn([{ role: "user", content: q }], "I understand your concern.");
      expect(result, `"${q}" SHOULD escalate`).toBe(true);
    }
  });
});
