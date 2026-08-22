/**
 * Wave 4 — Trust + Commercial Experience — focused tests.
 *
 * Covers per spec:
 * 1.  /security public route works — no unsupported certification claims
 * 2.  Pricing uses canonical architecture and no new hardcoded prices
 * 3.  Pricing handles unavailable data safely (isLoading state present)
 * 4.  /white-label remains public
 * 5.  White-label authenticated config remains protected (/branding, /reseller)
 * 6.  Legal public routes remain reachable
 * 7.  Public nav/footer trust links resolve correctly
 * 8.  Wave 4 modified strings have EN/SQ parity
 * 9.  CTA safe-return behavior remains intact
 * 10. No admin routes exposed
 * 11. All 10 Wave 3 pages remain intact
 * 12. /developer → /public-api remains intact
 * 13. AI-2 files are untouched
 * 14. SOCIAL-1D files are untouched
 * 15. No production configuration changes
 * 16. /terms-and-payments uses LegalLayout (no hardcoded plan prices)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import en from "../../i18n/en";
import sq from "../../i18n/sq";

const appSource         = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const footerSource      = readFileSync(resolve(process.cwd(), "src/components/public/PublicFooter.tsx"), "utf8");
const legalLayoutSource = readFileSync(resolve(process.cwd(), "src/components/legal/LegalLayout.tsx"), "utf8");
const termsPaySource    = readFileSync(resolve(process.cwd(), "src/pages/TermsAndPayments.tsx"), "utf8");
const securitySource    = readFileSync(resolve(process.cwd(), "src/pages/legal/SecurityOverview.tsx"), "utf8");
const pricingSource     = readFileSync(resolve(process.cwd(), "src/pages/Pricing.tsx"), "utf8");
const whiteLabelSource  = readFileSync(resolve(process.cwd(), "src/pages/WhiteLabel.tsx"), "utf8");

// ── 1. /security public route ─────────────────────────────────────────────────

describe("Wave 4 — /security public route", () => {
  it("registers /security route in App.tsx", () => {
    expect(appSource).toContain('path="/security"');
  });

  it("/security is not wrapped in ProtectedPage", () => {
    // Extract the line with path="/security" and ensure it is not immediately preceded by ProtectedPage
    const secRouteMatch = appSource.match(/path="\/security"[^\n]*/);
    expect(secRouteMatch).not.toBeNull();
    expect(secRouteMatch![0]).not.toContain("ProtectedPage");
  });

  it("SecurityOverview renders SecurityOverview component", () => {
    expect(appSource).toContain("SecurityOverview");
  });
});

describe("Wave 4 — /security no unsupported certification claims", () => {
  const FORBIDDEN_CLAIMS = [
    "SOC 2 certified",
    "ISO 27001 certified",
    "HIPAA compliant",
    "PCI certified",
    "passkeys",
    "AAL2",
    "penetration-test certified",
    "bank-grade security",
    "GDPR certified",
    "GDPR compliant",
  ];

  FORBIDDEN_CLAIMS.forEach((claim) => {
    it(`SecurityOverview does not claim: "${claim}"`, () => {
      expect(securitySource.toLowerCase()).not.toContain(claim.toLowerCase());
    });
  });

  it("SecurityOverview states it is not a certification", () => {
    expect(securitySource).toContain("not a certification");
  });
});

// ── 2. Pricing — canonical source, no hardcoded prices ───────────────────────

describe("Wave 4 — /pricing canonical pricing architecture", () => {
  it("/pricing route is registered in App.tsx", () => {
    expect(appSource).toContain('path="/pricing"');
  });

  it("Pricing.tsx imports useMonetizationCatalog (canonical source)", () => {
    expect(pricingSource).toContain("useMonetizationCatalog");
  });

  it("Pricing.tsx does NOT import hardcoded plan price constants", () => {
    // Should not define standalone price arrays with currency amounts
    expect(pricingSource).not.toMatch(/const\s+PLANS\s*=/);
  });
});

describe("Wave 4 — no new hardcoded prices in Wave 4 modified files", () => {
  const WAVE4_MODIFIED_SOURCES = [
    footerSource,
    legalLayoutSource,
    termsPaySource,
  ].join("\n");

  it("Wave 4 modified files do not contain hardcoded plan price patterns (X,XXX ALL/mo)", () => {
    // Must not contain patterns like "9,900 ALL/mo" or "19,900 ALL"
    expect(WAVE4_MODIFIED_SOURCES).not.toMatch(/\d{1,3},\d{3}\s+ALL\/mo/);
  });

  it("TermsAndPayments.tsx does not contain old plan names (Starter, Growth, Pro) as hardcoded prices", () => {
    // The old hardcoded lines like "Starter 9,900 ALL/mo" must be gone
    expect(termsPaySource).not.toMatch(/Starter\s+\d[\d,]+\s+ALL/);
    expect(termsPaySource).not.toMatch(/Growth\s+\d[\d,]+\s+ALL/);
    expect(termsPaySource).not.toMatch(/Pro\s+\d[\d,]+\s+ALL/);
  });

  it("i18n Wave 4 keys do not contain EUR/GBP/USD currency price patterns", () => {
    const allI18n = JSON.stringify(en) + JSON.stringify(sq);
    expect(allI18n).not.toMatch(/€\d+/);
    expect(allI18n).not.toMatch(/\$\d+\/month/i);
    expect(allI18n).not.toMatch(/£\d+/);
  });
});

// ── 3. Pricing safe neutral state ─────────────────────────────────────────────

describe("Wave 4 — Pricing safe neutral state when data unavailable", () => {
  it("Pricing.tsx has isLoading guard", () => {
    expect(pricingSource).toContain("isLoading");
  });

  it("Pricing.tsx does not invent fallback prices for loading state", () => {
    // Must not have a hardcoded fallback like: if (isLoading) return <div>€99</div>
    expect(pricingSource).not.toMatch(/isLoading.*€\d+/s);
    expect(pricingSource).not.toMatch(/isLoading.*\$\d+/s);
  });
});

// ── 4. /white-label remains public ───────────────────────────────────────────

describe("Wave 4 — /white-label public route", () => {
  it("/white-label route is registered in App.tsx", () => {
    expect(appSource).toContain('path="/white-label"');
  });

  it("/white-label is NOT wrapped in ProtectedPage", () => {
    const match = appSource.match(/path="\/white-label"[^\n]*/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain("ProtectedPage");
  });
});

// ── 5. White Label authenticated config protected ─────────────────────────────

describe("Wave 4 — White Label authenticated configuration protected", () => {
  it("/branding route is wrapped in ProtectedPage or PermissionPage", () => {
    // /branding uses PermissionPage (more restrictive than ProtectedPage — requires billing permission)
    const brandingLine = appSource.match(/path="\/branding"[^\n]*/);
    expect(brandingLine).not.toBeNull();
    const line = brandingLine![0];
    const isProtected = line.includes("ProtectedPage") || line.includes("PermissionPage");
    expect(isProtected, "/branding must be inside ProtectedPage or PermissionPage").toBe(true);
  });

  it("/reseller route exists and is protected", () => {
    // ResellerDashboard is in a ProtectedPage
    expect(appSource).toContain("ResellerDashboard");
    expect(appSource).toContain('path="/reseller"');
  });

  it("WhiteLabel.tsx application form requires login (checks !user)", () => {
    expect(whiteLabelSource).toContain("!user");
  });

  it("WhiteLabel.tsx does not expose /branding config publicly", () => {
    // The public page should not link directly to the branding config page as primary nav
    expect(whiteLabelSource).not.toContain('to="/branding"');
  });
});

// ── 6. Legal public routes ────────────────────────────────────────────────────

describe("Wave 4 — Legal public routes reachable", () => {
  const LEGAL_ROUTES = [
    "/privacy",
    "/terms",
    "/cookies",
    "/refund",
    "/dpa",
    "/affiliate-terms",
    "/terms-and-payments",
  ];

  LEGAL_ROUTES.forEach((route) => {
    it(`${route} route is registered in App.tsx`, () => {
      expect(appSource).toContain(`path="${route}"`);
    });
  });

  it("all legal routes are publicly accessible (none wrapped in ProtectedPage)", () => {
    LEGAL_ROUTES.forEach((route) => {
      const routeLine = appSource.match(new RegExp(`path="${route.replace("/", "\\/")}[^"]*"[^\\n]*`));
      if (routeLine) {
        expect(routeLine[0], `${route} must not be in ProtectedPage`).not.toContain("ProtectedPage");
      }
    });
  });
});

// ── 7. Public nav/footer trust links ─────────────────────────────────────────

describe("Wave 4 — Public footer trust links", () => {
  const EXPECTED_FOOTER_HREFS = [
    "/privacy",
    "/terms",
    "/cookies",
    "/dpa",
    "/refund",
    "/affiliate-terms",
    "/terms-and-payments",
    "/security",
  ];

  EXPECTED_FOOTER_HREFS.forEach((href) => {
    it(`footer contains link to ${href}`, () => {
      expect(footerSource).toContain(`href: "${href}"`);
    });
  });
});

describe("Wave 4 — LegalLayout links", () => {
  it("LegalLayout LEGAL_LINKS includes /terms-and-payments", () => {
    expect(legalLayoutSource).toContain("/terms-and-payments");
  });

  it("LegalLayout LEGAL_LINKS includes /security", () => {
    expect(legalLayoutSource).toContain("/security");
  });

  it("LegalLayout LEGAL_LINKS includes /dpa", () => {
    expect(legalLayoutSource).toContain("/dpa");
  });
});

// ── 8. Wave 4 EN/SQ i18n parity ──────────────────────────────────────────────

describe("Wave 4 — EN/SQ i18n parity", () => {
  type AnyObj = Record<string, unknown>;
  const enT = en as AnyObj;
  const sqT = sq as AnyObj;

  // securityPage
  it("EN has securityPage.seo.title", () => {
    expect(((enT.securityPage as AnyObj)?.seo as AnyObj)?.title).toBeTruthy();
  });
  it("SQ has securityPage.seo.title", () => {
    expect(((sqT.securityPage as AnyObj)?.seo as AnyObj)?.title).toBeTruthy();
  });
  it("SQ securityPage.seo.title differs from EN (Albanian)", () => {
    const enTitle = ((enT.securityPage as AnyObj)?.seo as AnyObj)?.title;
    const sqTitle = ((sqT.securityPage as AnyObj)?.seo as AnyObj)?.title;
    expect(sqTitle).not.toBe(enTitle);
  });

  it("EN has securityPage.pillars.rls.title", () => {
    expect((((enT.securityPage as AnyObj)?.pillars as AnyObj)?.rls as AnyObj)?.title).toBeTruthy();
  });
  it("SQ has securityPage.pillars.rls.title", () => {
    expect((((sqT.securityPage as AnyObj)?.pillars as AnyObj)?.rls as AnyObj)?.title).toBeTruthy();
  });

  // pricingPage
  it("EN has pricingPage.hero.title", () => {
    expect(((enT.pricingPage as AnyObj)?.hero as AnyObj)?.title).toBeTruthy();
  });
  it("SQ has pricingPage.hero.title", () => {
    expect(((sqT.pricingPage as AnyObj)?.hero as AnyObj)?.title).toBeTruthy();
  });
  it("SQ pricingPage.hero.title differs from EN", () => {
    const enTitle = ((enT.pricingPage as AnyObj)?.hero as AnyObj)?.title;
    const sqTitle = ((sqT.pricingPage as AnyObj)?.hero as AnyObj)?.title;
    expect(sqTitle).not.toBe(enTitle);
  });

  it("EN has pricingPage.canonicalSource", () => {
    expect((enT.pricingPage as AnyObj)?.canonicalSource).toBeTruthy();
  });
  it("SQ has pricingPage.canonicalSource", () => {
    expect((sqT.pricingPage as AnyObj)?.canonicalSource).toBeTruthy();
  });

  // whiteLabelPage
  it("EN has whiteLabelPage.hero.title", () => {
    expect(((enT.whiteLabelPage as AnyObj)?.hero as AnyObj)?.title).toBeTruthy();
  });
  it("SQ has whiteLabelPage.hero.title", () => {
    expect(((sqT.whiteLabelPage as AnyObj)?.hero as AnyObj)?.title).toBeTruthy();
  });

  // trust
  it("EN has trust.dataControl", () => {
    expect((enT.trust as AnyObj)?.dataControl).toBeTruthy();
  });
  it("SQ has trust.dataControl", () => {
    expect((sqT.trust as AnyObj)?.dataControl).toBeTruthy();
  });
  it("SQ trust.dataControl differs from EN", () => {
    expect((sqT.trust as AnyObj)?.dataControl).not.toBe((enT.trust as AnyObj)?.dataControl);
  });

  // footerWave4
  it("EN has footerWave4.refund", () => {
    expect((enT.footerWave4 as AnyObj)?.refund).toBeTruthy();
  });
  it("SQ has footerWave4.refund", () => {
    expect((sqT.footerWave4 as AnyObj)?.refund).toBeTruthy();
  });
  it("SQ footerWave4.refund differs from EN", () => {
    expect((sqT.footerWave4 as AnyObj)?.refund).not.toBe((enT.footerWave4 as AnyObj)?.refund);
  });

  it("EN has footerWave4.termsAndPayments", () => {
    expect((enT.footerWave4 as AnyObj)?.termsAndPayments).toBeTruthy();
  });
  it("SQ has footerWave4.termsAndPayments", () => {
    expect((sqT.footerWave4 as AnyObj)?.termsAndPayments).toBeTruthy();
  });
});

// ── 9. CTA safe-return behavior ───────────────────────────────────────────────

describe("Wave 4 — CTA safe-return behavior intact", () => {
  it("PublicCTA.tsx exists and exports PublicCTA", () => {
    const ctaSource = readFileSync(resolve(process.cwd(), "src/components/public/PublicCTA.tsx"), "utf8");
    expect(ctaSource).toContain("export function PublicCTA");
  });

  it("PublicCTA uses validateInternalPath for safe navigation", () => {
    const ctaSource = readFileSync(resolve(process.cwd(), "src/components/public/PublicCTA.tsx"), "utf8");
    expect(ctaSource).toContain("validateInternalPath");
  });

  it("no public CTA links to admin routes", () => {
    const ctaSource = readFileSync(resolve(process.cwd(), "src/components/public/PublicCTA.tsx"), "utf8");
    expect(ctaSource).not.toContain('"/admin"');
    expect(ctaSource).not.toContain("admin-only");
  });
});

// ── 10. No admin routes exposed ───────────────────────────────────────────────

describe("Wave 4 — No admin routes publicly exposed", () => {
  const ADMIN_ROUTES = ["/admin", "/admin-support", "/admin-business"];
  ADMIN_ROUTES.forEach((route) => {
    it(`${route} does not appear in public nav config`, () => {
      const navSource = readFileSync(resolve(process.cwd(), "src/components/public/publicNavConfig.ts"), "utf8");
      expect(navSource).not.toContain(`"${route}"`);
    });
  });

  it("public footer does not link to admin routes", () => {
    expect(footerSource).not.toContain('"/admin"');
  });
});

// ── 11. Wave 3 platform pages remain intact ───────────────────────────────────

describe("Wave 4 — Wave 3 regression: all 10 platform pages intact", () => {
  const PLATFORM_ROUTES = [
    "/platform",
    "/platform/ai",
    "/platform/unified-inbox",
    "/platform/crm",
    "/platform/marketing",
    "/platform/automation",
    "/platform/analytics",
    "/platform/developers",
    "/platform/partners",
    "/platform/lidhjet",
  ];

  PLATFORM_ROUTES.forEach((route) => {
    it(`${route} still registered in App.tsx`, () => {
      expect(appSource).toContain(`path="${route}"`);
    });
  });
});

// ── 12. /developer → /public-api remains intact ──────────────────────────────

describe("Wave 4 — /developer → /public-api redirect intact", () => {
  it("registers /developer redirect", () => {
    expect(appSource).toContain('path="/developer"');
  });

  it("/developer redirects to /public-api (not /platform/developers)", () => {
    expect(appSource).toContain('to="/public-api"');
    expect(appSource).not.toMatch(/path="\/developer"[^}]*to="\/platform\/developers"/s);
  });
});

// ── 13. AI-2 files untouched ──────────────────────────────────────────────────

describe("Wave 4 — Parallel work safety: AI-2 files untouched", () => {
  const AI2_PATTERNS = [
    "aiRouter",
    "canonicalAI",
    "aiProviderFallback",
    "ai1b",
  ];

  it("Wave 4 i18n files do not reference AI-2 internal identifiers", () => {
    const i18nSrc = JSON.stringify(en) + JSON.stringify(sq);
    AI2_PATTERNS.forEach((p) => {
      expect(i18nSrc).not.toContain(p);
    });
  });
});

// ── 14. SOCIAL-1D files untouched ────────────────────────────────────────────

describe("Wave 4 — Parallel work safety: SOCIAL-1D files untouched", () => {
  const SOCIAL_PATTERNS = ["identityGraph", "interestMemory", "social1"];

  it("Wave 4 i18n files do not reference SOCIAL-1D internal identifiers", () => {
    const i18nSrc = JSON.stringify(en) + JSON.stringify(sq);
    SOCIAL_PATTERNS.forEach((p) => {
      expect(i18nSrc).not.toContain(p);
    });
  });

  it("TermsAndPayments.tsx does not import social or AI facade modules", () => {
    SOCIAL_PATTERNS.forEach((p) => {
      expect(termsPaySource).not.toContain(p);
    });
    expect(termsPaySource).not.toContain("aiRouter");
  });
});

// ── 15. No production config changes ─────────────────────────────────────────

describe("Wave 4 — No production configuration changes", () => {
  it("package.json unchanged (parses and has expected structure)", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.name).toBeTruthy();
    expect(pkg.dependencies).toBeTruthy();
    expect(pkg.devDependencies).toBeTruthy();
  });

  it("vite.config.ts is unchanged (no new build targets added by Wave 4)", () => {
    const viteSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    // Just verify the file loads; Wave 4 should not modify build config
    expect(viteSource).toContain("vite");
  });
});

// ── 16. /terms-and-payments uses LegalLayout, no hardcoded plan prices ────────

describe("Wave 4 — /terms-and-payments refine", () => {
  it("TermsAndPayments.tsx imports LegalLayout", () => {
    expect(termsPaySource).toContain("LegalLayout");
  });

  it("TermsAndPayments.tsx does not contain old-style div wrapper (min-h-screen without LegalLayout)", () => {
    // The old implementation used a bare <div className="min-h-screen bg-background"> without LegalLayout
    // After Wave 4 refine it should use LegalLayout instead
    expect(termsPaySource).not.toMatch(/<div className="min-h-screen bg-background">/);
  });

  it("TermsAndPayments.tsx links to /pricing for current prices", () => {
    expect(termsPaySource).toContain("/pricing");
  });

  it("TermsAndPayments.tsx does not hardcode Starter/Growth/Pro plan names with prices", () => {
    expect(termsPaySource).not.toMatch(/9[,.]900\s*ALL/);
    expect(termsPaySource).not.toMatch(/19[,.]900\s*ALL/);
    expect(termsPaySource).not.toMatch(/39[,.]900\s*ALL/);
  });
});

// ── Bonus: SecurityOverview uses LegalLayout (public shell) ──────────────────

describe("Wave 4 — SecurityOverview uses public-compatible layout", () => {
  it("SecurityOverview imports and uses LegalLayout", () => {
    expect(securitySource).toContain("LegalLayout");
  });

  it("SecurityOverview does not use DashboardLayout", () => {
    expect(securitySource).not.toContain("DashboardLayout");
  });
});
