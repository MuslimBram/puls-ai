import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8");

const baseRegistry = read("supabase", "functions", "_shared", "public-product-registry.ts");
const expandedRegistry = read("supabase", "functions", "_shared", "public-product-knowledge.ts");
const helpBot = read("supabase", "functions", "ai-help-bot", "index.ts");
const floatingBot = read("src", "components", "FloatingAIBot.tsx");
const messageRenderer = read("src", "components", "PublicBotMessageContent.tsx");
const register = read("src", "pages", "Register.tsx");

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

    for (const key of requiredBaseKeys) expect(baseRegistry).toContain(`key: "${key}"`);
    expect(baseRegistry.match(/\bkey: "/g)?.length ?? 0).toBeGreaterThanOrEqual(27);
    for (const key of ["business_memory", "revenue_intelligence", "journey_intelligence", "multi_agent", "lead_scoring", "academy"]) {
      expect(expandedRegistry).toContain(`key: "${key}"`);
    }
  });

  it("stores explanation, benefit, status and public navigation data", () => {
    for (const field of ["summary_sq:", "summary_en:", "how_it_works_sq:", "how_it_works_en:", "benefit_sq:", "benefit_en:", "public_info_route:", "status_note_sq:", "status_note_en:"]) {
      expect(baseRegistry).toContain(field);
    }
  });

  it("fails closed when source/UI existence is not runtime certification", () => {
    const combinedRegistry = `${baseRegistry}\n${expandedRegistry}`;
    expect(combinedRegistry).toContain('status: "limited_or_not_certified"');
    expect(combinedRegistry).toContain('status: "external_setup_required"');
    expect(helpBot).toContain("PUBLICLY_VERIFIED_SURFACE_KEYS");
    expect(helpBot).toContain('runtime_certification: "not_implied_by_source_or_ui"');
    expect(helpBot).toContain("Source/UI existence is not runtime E2E proof");
    expect(helpBot).toContain("Never claim a feature is LIVE, production-ready, connected, runtime-certified or universally available merely because UI/source/routes exist");
    expect(expandedRegistry).toContain('key: "google_workspace_drive"');
    expect(expandedRegistry).toContain('key: "ads_intelligence"');
    expect(expandedRegistry).toContain('key: "vicidial"');
  });

  it("locks brand identity to Pulse AI and keeps BOS wording as descriptor only", () => {
    expect(helpBot).toContain('const PRODUCT_NAME = "Pulse AI"');
    expect(helpBot).toContain('const POSITIONING_DESCRIPTOR = "The AI Business Operating System"');
    expect(helpBot).toContain("is a positioning descriptor/tagline only");
    expect(helpBot).toContain("must never be presented as a second product or separate brand");
  });

  it("locks registration to the four current account profiles without inferring OAuth readiness", () => {
    expect(register).toContain('type AccountType = "business" | "freelancer" | "ambassador" | "white_label" | null');
    expect(helpBot).toContain('const PUBLIC_ACCOUNT_TYPES = ["Business", "Freelancer", "Ambassador", "White-Label"] as const');
    expect(helpBot).toContain("the current /register surface supports exactly four account profiles");
    expect(helpBot).toContain("Social provider readiness is a separate live-verification question");
    expect(helpBot).toContain("formatRegistrationFallback");
  });

  it("locks Lidhjet as a Pulse AI module with the four canonical opportunity categories", () => {
    expect(helpBot).toContain('const LIDHJET_CATEGORIES = ["Punë", "Shërbim", "Tregti", "Tjetër"] as const');
    expect(helpBot).toContain("Lidhjet is a free module inside");
    expect(helpBot).toContain("module_is_separate_brand: false");
    expect(helpBot).toContain("formatLidhjetFallback");
  });

  it("uses merged canonical referral policy instead of historical fixed percentages", () => {
    expect(helpBot).toContain("do not publish a fixed public commission percentage");
    expect(helpBot).toContain("first-payment based and uses the active partner account commission_rate");
    expect(helpBot).toContain("ordinary business referral configuration and partner commission configuration are separate mechanisms");
    expect(helpBot).not.toContain("Referral/commission history has unresolved conflicts");
    expect(helpBot).not.toContain("15%/35%");
  });

  it("grounds public answers in product knowledge and blocks private tenant data", () => {
    expect(helpBot).toContain('from "../_shared/public-product-knowledge.ts"');
    expect(helpBot).toContain("findPublicProductFeatures(question, 6)");
    expect(helpBot).toContain("what it does");
    expect(helpBot).toContain("how it works at a public-safe level");
    expect(helpBot).toContain("the visitor benefit");
    expect(helpBot).toContain("the exact canonical public page/link to open");
    expect(helpBot).toContain("PUBLIC DATA BOUNDARY");
    expect(helpBot).toContain("must never read, request, infer or reveal tenant Knowledge Base content");
    expect(helpBot).not.toContain('.from("knowledge_chunks")');
    expect(helpBot).not.toContain('.from("business_memories")');
    expect(helpBot).not.toContain('.from("leads")');
    expect(helpBot).not.toContain("Inside your account:");
  });

  it("keeps pricing DB-only and deterministic and scopes commercial-number blocking", () => {
    expect(helpBot).toContain('.from("pricing_settings")');
    expect(helpBot).toContain('.eq("is_public", true)');
    expect(helpBot).toContain("Pricing is deterministic and DB-only");
    expect(helpBot).toContain("if (isPricingIntent(question))");
    expect(helpBot).toContain("formatPublicPricing(pricingOk ? pricingRows : [], isAlbanian(question))");
    expect(helpBot).toContain("Use only numeric pricing values from CURRENT_PUBLIC_PRICING_FROM_pricing_settings.");
    expect(helpBot).toContain("function containsUntrustedCommercialNumber(question: string, reply: string)");
    expect(helpBot).toContain("if (!commercialContext) return false");
    expect(helpBot).toContain("containsUntrustedCommercialNumber(question, reply)");
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
    expect(helpBot).toContain('confidence_source: "grounded_evidence"');
    for (const category of ["billing_or_refund", "security_incident", "privacy_request", "technical_incident", "human_requested"]) {
      expect(helpBot).toContain(category);
    }
    expect(helpBot).toContain("assessment.confidence < MIN_GROUNDED_CONFIDENCE");
  });

  it("renders only allowlisted public links and collapses long answers behind Read more", () => {
    expect(floatingBot).toContain('import { PublicBotMessageContent } from "@/components/PublicBotMessageContent"');
    expect(floatingBot).toContain('<PublicBotMessageContent content={msg.content} />');
    expect(messageRenderer).toContain("PUBLIC_INTERNAL_ROUTES");
    expect(messageRenderer).toContain("APPROVED_EXTERNAL_HOSTS");
    expect(messageRenderer).toContain("isAllowedInternalRoute");
    expect(messageRenderer).toContain("isAllowedExternalUrl");
    expect(messageRenderer).toContain('!value.startsWith("/") || value.startsWith("//")');
    expect(messageRenderer).toContain('parsed.protocol === "https:"');
    expect(messageRenderer).toContain("PUBLIC_INTERNAL_ROUTES.some((route) => parsed.pathname === route)");
    expect(messageRenderer).toContain("<Link to={link}");
    expect(messageRenderer).toContain('rel="noopener noreferrer"');
    expect(messageRenderer).toContain('expanded ? "Show less" : "Read more"');
    expect(messageRenderer).toContain("PREVIEW_TARGET_CHARS");
  });

  it("uses fixed error codes and correlation IDs instead of arbitrary exception text", () => {
    expect(helpBot).toContain("const correlationId = crypto.randomUUID()");
    expect(helpBot).toContain('code: "AI_HELP_UNEXPECTED"');
    expect(helpBot).toContain("correlation_id: correlationId");
    expect(helpBot).toContain('console.error("ai_help_bot_failed", { code: "AI_HELP_UNEXPECTED", correlation_id: correlationId })');
    expect(helpBot).not.toContain("error instanceof Error ? error.message");
  });
});
