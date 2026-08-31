import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baseRegistry = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/public-product-registry.ts"),
  "utf8",
);
const expandedRegistry = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/public-product-knowledge.ts"),
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
  it("covers the major Pulse AI surfaces plus expanded product knowledge", () => {
    const requiredBaseKeys = [
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

    for (const key of requiredBaseKeys) {
      expect(baseRegistry).toContain(`key: "${key}"`);
    }
    expect(baseRegistry.match(/\bkey: "/g)?.length ?? 0).toBeGreaterThanOrEqual(27);

    for (const key of ["business_memory", "revenue_intelligence", "journey_intelligence", "multi_agent", "lead_scoring", "academy"]) {
      expect(expandedRegistry).toContain(`key: "${key}"`);
    }
  });

  it("stores explanation, benefit, status and navigation data for product answers", () => {
    expect(baseRegistry).toContain("summary_sq:");
    expect(baseRegistry).toContain("summary_en:");
    expect(baseRegistry).toContain("how_it_works_sq:");
    expect(baseRegistry).toContain("how_it_works_en:");
    expect(baseRegistry).toContain("benefit_sq:");
    expect(baseRegistry).toContain("benefit_en:");
    expect(baseRegistry).toContain("public_info_route:");
    expect(baseRegistry).toContain("status_note_sq:");
    expect(baseRegistry).toContain("status_note_en:");
  });

  it("keeps unverified integrations truthfully qualified instead of declaring them universally live", () => {
    const combinedRegistry = `${baseRegistry}\n${expandedRegistry}`;
    expect(combinedRegistry).toContain('status: "limited_or_not_certified"');
    expect(combinedRegistry).toContain('status: "external_setup_required"');
    expect(combinedRegistry).toContain("must not be claimed as universally production-certified");
    expect(combinedRegistry).toContain("must not be called universally live without provider credentials and runtime proof");
  });

  it("grounds public answers in product knowledge and blocks private tenant data", () => {
    expect(helpBot).toContain('from "../_shared/public-product-knowledge.ts"');
    expect(helpBot).toContain("findPublicProductFeatures(question, 6)");
    expect(helpBot).toContain("what it does");
    expect(helpBot).toContain("how it works at a public-safe level");
    expect(helpBot).toContain("the visitor benefit");
    expect(helpBot).toContain("the exact canonical page/link to open");
    expect(helpBot).toContain("PUBLIC DATA BOUNDARY");
    expect(helpBot).toContain("must never read, request, infer or reveal tenant Knowledge Base content");
    expect(helpBot).not.toContain('.from("knowledge_chunks")');
    expect(helpBot).not.toContain('.from("business_memories")');
    expect(helpBot).not.toContain('.from("leads")');
  });

  it("keeps pricing DB-only and deterministic", () => {
    expect(helpBot).toContain('.from("pricing_settings")');
    expect(helpBot).toContain('.eq("is_public", true)');
    expect(helpBot).toContain("Pricing is deterministic and DB-only");
    expect(helpBot).toContain("if (isPricingIntent(question))");
    expect(helpBot).toContain("formatPublicPricing(pricingOk ? pricingRows : [], isAlbanian(question))");
    expect(helpBot).toContain("Use only numeric pricing values from CURRENT_PUBLIC_PRICING_FROM_pricing_settings.");
    expect(helpBot).toContain("containsUntrustedCommercialNumber");
    expect(helpBot).toContain("Referral/commission history has unresolved conflicts.");
  });

  it("supports Albanian/English, empathy, safe journey tone and natural upsell", () => {
    expect(helpBot).toContain("support Albanian and English");
    expect(helpBot).toContain("Exploring questions should be educational");
    expect(helpBot).toContain("complaint/repeated-failure situations should be empathetic first and re-engaging");
    expect(helpBot).toContain("For complaints: acknowledge the concern empathetically first");
    expect(helpBot).toContain("Upsell only when it is a natural, relevant recommendation");
  });

  it("enforces confidence and mandatory human handoff boundaries", () => {
    expect(helpBot).toContain("const MIN_GROUNDED_CONFIDENCE = 0.5");
    expect(helpBot).toContain("confidence_source: \"grounded_evidence\"");
    expect(helpBot).toContain("billing_or_refund");
    expect(helpBot).toContain("security_incident");
    expect(helpBot).toContain("privacy_request");
    expect(helpBot).toContain("technical_incident");
    expect(helpBot).toContain("human_requested");
    expect(helpBot).toContain("assessment.confidence < MIN_GROUNDED_CONFIDENCE");
  });

  it("renders safe clickable links and collapses long answers behind Read more", () => {
    expect(floatingBot).toContain('import { PublicBotMessageContent } from "@/components/PublicBotMessageContent"');
    expect(floatingBot).toContain('<PublicBotMessageContent content={msg.content} />');
    expect(messageRenderer).toContain("<Link to={link}");
    expect(messageRenderer).toContain('target="_blank"');
    expect(messageRenderer).toContain('rel="noopener noreferrer"');
    expect(messageRenderer).toContain('expanded ? "Show less" : "Read more"');
    expect(messageRenderer).toContain("PREVIEW_TARGET_CHARS");
  });
});
