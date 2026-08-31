import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");
const commissionGenerator = read("supabase/functions/generate-commissions/index.ts");
const adminFreelancers = read("src/hooks/useAdminFreelancers.ts");
const freelancerPurchase = read("src/components/FreelancerBusinessPurchase.tsx");
const legacyLanding = read("src/pages/Landing.tsx");
const faq = read("src/components/landing/FAQSection.tsx");
const howItWorks = read("src/components/landing/HowItWorks.tsx");
const accountTypes = read("src/components/register/AccountTypeOrbitSelector.tsx");
const vercelConfig = JSON.parse(read("vercel.json")) as {
  redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
};

describe("Phase F product truth closure", () => {
  it("never invents a fallback partner commission percentage", () => {
    for (const source of [stripeWebhook, commissionGenerator, adminFreelancers]) {
      expect(source).not.toContain("commission_rate || 10");
    }
    expect(stripeWebhook).toContain("Number(partner.commission_rate ?? 0)");
    expect(commissionGenerator).toContain("Number(partner.commission_rate ?? 0)");
    expect(adminFreelancers).toContain("Number(p.commission_rate ?? 0)");
  });

  it("sources freelancer business purchase pricing from pricing_settings", () => {
    expect(freelancerPurchase).toContain("usePricingSettings");
    expect(freelancerPurchase).toContain("monthly_price_all");
    expect(freelancerPurchase).toContain("monthly_price_eur");
    expect(freelancerPurchase).toContain("monthly_price_usd");
    expect(freelancerPurchase).not.toContain("const BASE_PRICES");
    expect(freelancerPurchase).not.toMatch(/standard:\s*49\b/);
    expect(freelancerPurchase).toContain("Price not configured");
  });

  it("retires the legacy public landing page at server and SPA boundaries", () => {
    expect(vercelConfig.redirects).toContainEqual({
      source: "/landing",
      destination: "/",
      permanent: true,
    });
    expect(legacyLanding).toContain('<Navigate to="/" replace />');
    expect(legacyLanding).not.toContain("TESTIMONIALS");
    expect(legacyLanding).not.toContain("90%");
    expect(legacyLanding).not.toContain("$299/m");
  });

  it("presents all four canonical account types", () => {
    for (const value of ["business", "freelancer", "ambassador", "white_label"]) {
      expect(accountTypes).toContain(`value: "${value}"`);
    }
    expect(howItWorks).toContain("Business, Freelancer, Ambassador or White-Label");
  });

  it("keeps public FAQ commercial answers configuration-driven", () => {
    expect(faq).toContain("active product catalog");
    expect(faq).toContain("does not promise a fixed public percentage or lifetime commission");
    expect(faq).toContain("White-Label");
    expect(faq).not.toContain("35% lifetime");
  });
});
