import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const registry = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/public-product-registry.ts"),
  "utf8",
);
const helpBot = readFileSync(
  resolve(process.cwd(), "supabase/functions/ai-help-bot/index.ts"),
  "utf8",
);
const floatingBot = readFileSync(
  resolve(process.cwd(), "src/components/FloatingAIBot.tsx"),
  "utf8",
);
const messageRenderer = readFileSync(
  resolve(process.cwd(), "src/components/PublicBotMessageContent.tsx"),
  "utf8",
);

describe("Public AI Product Expert", () => {
  it("has a broad canonical product registry covering the major Pulse AI surfaces", () => {
    const requiredKeys = [
      "ai_os",
      "ai_assistant",
      "unified_inbox",
      "whatsapp",
      "telegram",
      "facebook_instagram",
      "email",
      "sms_voice",
      "crm",
      "leads_sales",
      "automations",
      "marketing",
      "media_studio",
      "analytics",
      "business_scanner",
      "knowledge_training",
      "payments_billing",
      "partners_referral",
      "white_label",
      "lidhjet",
      "public_api",
      "custom_webhooks",
      "web_chat",
      "security",
      "auth_mfa",
      "pwa_mobile",
      "external_integrations",
    ];

    for (const key of requiredKeys) {
      expect(registry).toContain(`key: "${key}"`);
    }
    expect(registry.match(/\bkey: "/g)?.length ?? 0).toBeGreaterThanOrEqual(27);
  });

  it("stores explanation, benefit, status and navigation data for product answers", () => {
    expect(registry).toContain("summary_sq:");
    expect(registry).toContain("summary_en:");
    expect(registry).toContain("how_it_works_sq:");
    expect(registry).toContain("how_it_works_en:");
    expect(registry).toContain("benefit_sq:");
    expect(registry).toContain("benefit_en:");
    expect(registry).toContain("public_info_route:");
    expect(registry).toContain("status_note_sq:");
    expect(registry).toContain("status_note_en:");
  });

  it("keeps unverified integrations truthfully qualified instead of declaring them universally live", () => {
    expect(registry).toContain('status: "limited_or_not_certified"');
    expect(registry).toContain('status: "external_setup_required"');
    expect(registry).toContain("must not be claimed as universally production-certified");
    expect(registry).toContain("must not be called universally live without provider credentials and runtime proof");
  });

  it("grounds AI answers in the registry and requires explanation plus canonical links", () => {
    expect(helpBot).toContain('from "../_shared/public-product-registry.ts"');
    expect(helpBot).toContain("findPublicProductFeatures(question, 6)");
    expect(helpBot).toContain("what it does");
    expect(helpBot).toContain("how it works at a public-safe level");
    expect(helpBot).toContain("the visitor benefit");
    expect(helpBot).toContain("the exact canonical page/link to open");
    expect(helpBot).toContain("If a requested feature is not in PRODUCT_KNOWLEDGE, say you cannot verify it instead of inventing it.");
    expect(helpBot).toContain("Never claim a feature is live/certified merely because UI or source exists.");
  });

  it("keeps pricing grounded in pricing_settings and conflicting referral rates out of the bot prompt", () => {
    expect(helpBot).toContain('.from("pricing_settings")');
    expect(helpBot).toContain("Use only numeric pricing values from CURRENT_PUBLIC_PRICING_FROM_pricing_settings.");
    expect(helpBot).toContain("Referral/commission history has unresolved conflicts.");
  });

  it("renders assistant routes and external URLs as safe clickable links", () => {
    expect(floatingBot).toContain('import { PublicBotMessageContent } from "@/components/PublicBotMessageContent"');
    expect(floatingBot).toContain('<PublicBotMessageContent content={msg.content} />');
    expect(messageRenderer).toContain("<Link to={link}");
    expect(messageRenderer).toContain('target="_blank"');
    expect(messageRenderer).toContain('rel="noopener noreferrer"');
  });
});
