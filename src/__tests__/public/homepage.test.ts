import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexSource = readFileSync(resolve(process.cwd(), "src/pages/Index.tsx"), "utf8");
const enSource = readFileSync(resolve(process.cwd(), "src/i18n/en.ts"), "utf8");
const sqSource = readFileSync(resolve(process.cwd(), "src/i18n/sq.ts"), "utf8");

const forbiddenClaims = [
  "AI Software Factory",
  "AI Avatars",
  "AI Lip-Sync",
  "AI TikTok Ad Generator",
  "Top Amazon Products",
  "SERP Seismometer",
  "SOC 2 certified",
  "ISO certified",
  "GDPR certified",
  "Trusted by Growing Businesses",
  "Thousands of businesses",
];

describe("Wave 2 homepage", () => {
  it("uses the shared public shell and preserves the public AI widget", () => {
    expect(indexSource).toContain("<PublicShell");
    expect(indexSource).toContain("<FloatingAIBot />");
  });

  it("preserves public lead capture without pricing selection on the homepage", () => {
    expect(indexSource).toContain("<PublicLeadForm");
    expect(indexSource).toContain('source="homepage"');
    expect(indexSource).toContain("showPlanSelect={false}");
  });

  it("keeps pricing on the dedicated pricing page instead of rendering homepage price cards", () => {
    expect(indexSource).not.toContain("useMonetizationCatalog");
    expect(indexSource).not.toContain("formatALL(");
    expect(indexSource).toContain('to="/pricing"');
  });

  it("removes fake social proof, hardcoded testimonial blocks and unsupported feature marketing", () => {
    forbiddenClaims.forEach((phrase) => {
      expect(indexSource).not.toContain(phrase);
    });
    expect(indexSource).not.toContain("COMMUNITY_PHOTOS");
    expect(indexSource).not.toContain("TESTIMONIALS");
  });

  it("includes EN and SQ homepage translation namespaces", () => {
    expect(enSource).toContain("homepage:");
    expect(sqSource).toContain("homepage:");
    expect(enSource).toContain("leadForm:");
    expect(sqSource).toContain("leadForm:");
  });
});
