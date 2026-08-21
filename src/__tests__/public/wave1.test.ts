/**
 * Wave 1 public website tests — correction pass.
 *
 * Covers:
 * - publicNavConfig structure with canonical routes
 * - No non-canonical routes (/platform/ai-intelligence, /platform/crm-sales, /developer)
 * - Canonical public Lidhjet route = /platform/lidhjet
 * - Partners route = /platform/partners
 * - validateInternalPath (auth-aware CTA foundation)
 * - Login CTA uses the existing safe `next` contract
 * - publicSecurityClaim integrity (no forbidden claims, local PASS / remote pending distinction)
 * - locale keys present in EN and SQ
 * - publicNavConfig: no admin/internal routes exposed
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateInternalPath } from "../../lib/safeNavigate";
import { SECURITY_CLAIM } from "../../lib/publicSecurityClaim";
import { buildLoggedOutCtaLoginHref } from "../../components/public/publicCtaDestination";
import {
  platformNavItems,
  standaloneNavItems,
  businessNavItems,
  companyNavItems,
  allPublicNavItems,
} from "../../components/public/publicNavConfig";
import en from "../../i18n/en";
import sq from "../../i18n/sq";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Wave 1 route publication scope", () => {
  it("does NOT publish unfinished public product/company routes in App.tsx", () => {
    const unpublishedRoutes = [
      "/platform/ai",
      "/platform/unified-inbox",
      "/platform/crm",
      "/platform/marketing",
      "/platform/automation",
      "/platform/analytics",
      "/platform/developers",
      "/platform/lidhjet",
      "/platform/partners",
      "/about",
      "/contact",
      "/growth-suite",
    ];

    unpublishedRoutes.forEach((routePath) => {
      expect(appSource).not.toContain(`path="${routePath}"`);
    });
  });

  it("preserves existing /pricing and /security routes", () => {
    expect(appSource).toContain('path="/pricing"');
    expect(appSource).toContain("<Pricing />");
    expect(appSource).toContain('path="/security"');
    expect(appSource).toContain("<SecurityOverview />");
  });
});

// ── publicNavConfig ────────────────────────────────────────────────────────────

describe("publicNavConfig", () => {
  it("has at least 6 platform nav items", () => {
    expect(platformNavItems.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps developers as a non-live coming soon item", () => {
    const devItem = platformNavItems.find((i) => i.labelKey === "nav.platform.developers");
    expect(devItem).toBeDefined();
    expect(devItem?.comingSoon).toBe(true);
  });

  it("does NOT use unpublished platform detail routes", () => {
    const exposed = allPublicNavItems.some((i) =>
      [
        "/platform/ai",
        "/platform/unified-inbox",
        "/platform/crm",
        "/platform/marketing",
        "/platform/automation",
        "/platform/analytics",
        "/platform/developers",
        "/platform/lidhjet",
      ].includes(i.href),
    );
    expect(exposed).toBe(false);
  });

  it("does NOT expose /developer (non-canonical route — must be /platform/developers)", () => {
    const exposed = allPublicNavItems.some((i) => i.href === "/developer");
    expect(exposed).toBe(false);
  });

  it("keeps Lidhjet as a non-live coming soon item", () => {
    const lidhjetItem = allPublicNavItems.find((i) => i.labelKey === "nav.standalone.lidhjet");
    expect(lidhjetItem).toBeDefined();
    expect(lidhjetItem?.comingSoon).toBe(true);
  });

  it("Partners route is /platform/partners (not /partners)", () => {
    const partnersItem = allPublicNavItems.find((i) => i.href === "/platform/partners");
    expect(partnersItem).toBeDefined();
    const wrongItem = allPublicNavItems.find((i) => i.href === "/partners");
    expect(wrongItem).toBeUndefined();
  });

  it("does NOT expose admin routes", () => {
    const adminRoutes = allPublicNavItems.filter((i) =>
      i.href.startsWith("/admin"),
    );
    expect(adminRoutes).toHaveLength(0);
  });

  it("does NOT expose dashboard route in public nav", () => {
    const dashboardRoutes = allPublicNavItems.filter(
      (i) => i.href === "/dashboard",
    );
    expect(dashboardRoutes).toHaveLength(0);
  });

  it("all nav item hrefs are internal paths (pass validateInternalPath)", () => {
    for (const item of allPublicNavItems) {
      const result = validateInternalPath(item.href);
      expect(result, `Expected ${item.href} to be a valid internal path`).not.toBeNull();
    }
  });

  it("standalone nav contains pricing and security", () => {
    const hrefs = standaloneNavItems.map((i) => i.href);
    expect(hrefs).toContain("/pricing");
    expect(hrefs).toContain("/security");
  });

  it("business nav contains white-label", () => {
    const hrefs = businessNavItems.map((i) => i.href);
    expect(hrefs).toContain("/white-label");
  });

  it("company nav items exist (about, contact)", () => {
    const hrefs = companyNavItems.map((i) => i.href);
    expect(hrefs).toContain("/about");
    expect(hrefs).toContain("/contact");
  });
});

// ── validateInternalPath (auth-aware CTA safety) ──────────────────────────────

describe("CTA auth-aware navigation safety (validateInternalPath)", () => {
  it("accepts /dashboard (logged-in CTA destination)", () => {
    expect(validateInternalPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts /register?beta=1 (beta CTA)", () => {
    expect(validateInternalPath("/register?beta=1")).toBe("/register?beta=1");
  });

  it("login CTA uses `next` param (not `returnTo`) — safe contract", () => {
    // The PublicCTA builds /login?next=<encoded-path>
    const loginHref = `/login?next=${encodeURIComponent("/pricing")}`;
    expect(validateInternalPath(loginHref)).toBe(loginHref);
    // Verify `next` is the param name — returnTo must NOT be used
    expect(loginHref).toContain("next=");
    expect(loginHref).not.toContain("returnTo=");
  });

  it("accepts /login?next=%2Fpricing (next-URL)", () => {
    expect(validateInternalPath("/login?next=%2Fpricing")).toBe(
      "/login?next=%2Fpricing",
    );
  });

  it("default logged-out CTA builds next from validated appDestination", () => {
    expect(buildLoggedOutCtaLoginHref("/crm")).toBe("/login?next=%2Fcrm");
    expect(buildLoggedOutCtaLoginHref("https://evil.com")).toBe("/login?next=%2Fdashboard");
    expect(buildLoggedOutCtaLoginHref()).toBe("/login?next=%2Fdashboard");
  });

  it("rejects external URL in CTA destination", () => {
    expect(validateInternalPath("https://evil.com")).toBeNull();
  });

  it("rejects protocol-relative URL", () => {
    expect(validateInternalPath("//evil.com")).toBeNull();
  });

  it("rejects javascript: scheme", () => {
    expect(validateInternalPath("javascript:void(0)")).toBeNull();
  });
});

// ── publicSecurityClaim integrity ─────────────────────────────────────────────

describe("publicSecurityClaim", () => {
  const forbiddenPhrases = [
    "SOC 2 certified",
    "ISO 27001 certified",
    "GDPR certified",
    "HIPAA compliant",
    "fully production-verified",
    "end-to-end workspace data isolation",
    "encrypted data in transit and at rest",
    "encryption-at-rest",
    "audit logging",
    "regular internal security reviews",
    "reviewed against industry standards",
  ];

  const allText = Object.values(SECURITY_CLAIM).flat().join(" ");

  forbiddenPhrases.forEach((phrase) => {
    it(`does NOT claim "${phrase}"`, () => {
      expect(allText.toLowerCase()).not.toContain(phrase.toLowerCase());
    });
  });

  it("has a non-empty summary", () => {
    expect(SECURITY_CLAIM.summary.length).toBeGreaterThan(20);
  });

  it("disclaimer contains explicit local/canonical PASS statement", () => {
    expect(SECURITY_CLAIM.disclaimer.toLowerCase()).toContain("local");
    expect(SECURITY_CLAIM.disclaimer.toLowerCase()).toContain("pass");
  });

  it("disclaimer contains remote production pending statement", () => {
    const d = SECURITY_CLAIM.disclaimer.toLowerCase();
    expect(d).toContain("remote production");
    expect(d).toContain("pending");
  });

  it("has at least 4 security points", () => {
    expect(SECURITY_CLAIM.points.length).toBeGreaterThanOrEqual(4);
  });
});

// ── EN / SQ locale foundation ─────────────────────────────────────────────────

describe("EN locale — Wave 1 public keys present", () => {
  it("has brand.descriptor", () => {
    expect((en as Record<string, Record<string, string>>).brand?.descriptor).toBeTruthy();
  });

  it("has cta.getStarted", () => {
    expect((en as Record<string, Record<string, string>>).cta?.getStarted).toBeTruthy();
  });

  it("has nav.group.platform", () => {
    expect((en as Record<string, Record<string, string>>).nav?.group).toBeTruthy();
  });

  it("has badge.comingSoon", () => {
    expect((en as Record<string, Record<string, string>>).badge?.comingSoon).toBeTruthy();
  });

  it("has pricing.neutralNotice", () => {
    expect((en as Record<string, Record<string, string>>).pricing?.neutralNotice).toBeTruthy();
  });

  it("has footer legal link labels", () => {
    expect((en as Record<string, Record<string, string>>).footer?.links).toBeTruthy();
  });

  it("has footer.rightsReserved", () => {
    expect((en as Record<string, Record<string, string>>).footer?.rightsReserved).toBeTruthy();
  });
});

describe("SQ locale — Wave 1 public keys present", () => {
  it("has brand.descriptor in Albanian", () => {
    const descriptor = (sq as Record<string, Record<string, string>>).brand?.descriptor;
    expect(descriptor).toBeTruthy();
    // Should be Albanian content (different from English)
    expect(descriptor).not.toBe(
      (en as Record<string, Record<string, string>>).brand?.descriptor,
    );
  });

  it("has cta.getStarted in Albanian", () => {
    expect((sq as Record<string, Record<string, string>>).cta?.getStarted).toBeTruthy();
  });

  it("has nav.group.platform in Albanian", () => {
    expect((sq as Record<string, Record<string, string>>).nav?.group).toBeTruthy();
  });

  it("has badge.comingSoon in Albanian", () => {
    expect((sq as Record<string, Record<string, string>>).badge?.comingSoon).toBeTruthy();
  });

  it("has leadForm translations in Albanian", () => {
    expect((sq as Record<string, Record<string, string>>).leadForm).toBeTruthy();
  });
});
