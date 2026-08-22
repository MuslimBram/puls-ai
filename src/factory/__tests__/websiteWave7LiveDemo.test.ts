import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("Website Wave 7 — public live demo + lead integration", () => {
  it("keeps the public AI help path workspace-neutral", () => {
    const helpBot = readFileSync(
      repoFile("supabase", "functions", "ai-help-bot", "index.ts"),
      "utf-8",
    );

    expect(helpBot).toContain('workspace_id: null');
    expect(helpBot).toContain('const ROUTER_TASK_TYPE = "customer_support"');
    expect(helpBot).toContain("Never access or reveal workspace/customer/CRM/private memory data");
  });

  it("routes anonymous live-demo leads through the public edge function, not direct database writes", () => {
    const bot = readFileSync(repoFile("src", "components", "FloatingAIBot.tsx"), "utf-8");

    expect(bot).toContain('supabase.functions.invoke("ai-help-bot"');
    expect(bot).toContain('supabase.functions.invoke("public-lead-capture"');
    expect(bot).toContain('source: "live_demo"');
    expect(bot).toContain("privacy_consent: true");
    expect(bot).not.toContain('.from("public_leads"');
    expect(bot).not.toContain('.from("enterprise_leads"');
  });

  it("persists anonymous requests to the canonical public_leads table", () => {
    const capture = readFileSync(
      repoFile("supabase", "functions", "public-lead-capture", "index.ts"),
      "utf-8",
    );

    expect(capture).toContain('.from("public_leads")');
    expect(capture).not.toContain('.from("enterprise_leads")');
    expect(capture).toContain('status: "new"');
    expect(capture).toContain("ai_score: analysis.score");
    expect(capture).toContain("ai_intent: analysis.intent");
    expect(capture).toContain("target_workspace_id: null");
  });

  it("never trusts caller-supplied target_workspace_id for public AI analysis", () => {
    const capture = readFileSync(
      repoFile("supabase", "functions", "public-lead-capture", "index.ts"),
      "utf-8",
    );
    const analysis = readFileSync(
      repoFile("supabase", "functions", "public-lead-capture", "lead-analysis.ts"),
      "utf-8",
    );

    expect(analysis).toContain("target_workspace_id?: string");
    expect(capture).toContain("resolveTrustedWorkspaceId: () => null");
    expect(capture).toContain("target_workspace_id: null");
    expect(capture).not.toContain("workspaceId: body.target_workspace_id");
  });

  it("requires explicit privacy consent for live-demo lead capture", () => {
    const capture = readFileSync(
      repoFile("supabase", "functions", "public-lead-capture", "index.ts"),
      "utf-8",
    );
    const bot = readFileSync(repoFile("src", "components", "FloatingAIBot.tsx"), "utf-8");

    expect(capture).toContain('source === "live_demo" && body.privacy_consent !== true');
    expect(bot).toContain("checked={privacyConsent}");
    expect(bot).toContain('localizedPath("/privacy")');
  });

  it("has short-window duplicate protection without permanently blocking repeat contacts", () => {
    const capture = readFileSync(
      repoFile("supabase", "functions", "public-lead-capture", "index.ts"),
      "utf-8",
    );

    expect(capture).toContain("Date.now() - 5 * 60_000");
    expect(capture).toContain('.gte("created_at", duplicateSince)');
    expect(capture).toContain("duplicate: true");
  });

  it("reuses approved EN/SQ translation keys for new anonymous live-demo UI", () => {
    const bot = readFileSync(repoFile("src", "components", "FloatingAIBot.tsx"), "utf-8");

    expect(bot).toContain('t("homepage.hero.brand")');
    expect(bot).toContain('t("homepage.aiSection.eyebrow")');
    expect(bot).toContain('t("homepage.aiSection.description")');
    expect(bot).toContain('t("homepage.leadForm.title")');
    expect(bot).toContain('t("leadForm.privacyPolicy")');
  });
});
