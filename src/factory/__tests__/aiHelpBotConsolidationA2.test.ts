import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("AI-1A2 Public AI Help Bot Consolidation", () => {
  it("removes direct Lovable gateway/provider bypass and routes through canonical ai-router", () => {
    const helpBot = readFileSync(repoFile("supabase", "functions", "ai-help-bot", "index.ts"), "utf-8");

    expect(helpBot).not.toContain("LOVABLE_API_KEY");
    expect(helpBot).not.toContain("ai.gateway.lovable.dev");
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

  it("prevents anonymous false notification-success claims while keeping authenticated escalation behavior", () => {
    const floatingBot = readFileSync(repoFile("src", "components", "FloatingAIBot.tsx"), "utf-8");

    expect(floatingBot).toContain("let escalationNote");
    expect(floatingBot).toContain("if (user?.id) {");
    expect(floatingBot).toContain("const notified = await notifyAdmin(reply);");
    expect(floatingBot).toContain("For account-specific or unresolved issues, please sign in and open Helpdesk so our team can assist you.");
    expect(floatingBot).toContain("A specialist has been notified and will connect with you shortly. Feel free to keep chatting in the meantime.");
  });
});
