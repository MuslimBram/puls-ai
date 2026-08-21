/**
 * Wave 1 public website tests.
 *
 * Covers:
 * - publicNavConfig structure
 * - validateInternalPath (auth-aware CTA foundation)
 * - publicSecurityClaim integrity (no forbidden claims)
 * - locale keys present in EN and SQ
 * - publicNavConfig: no admin/internal routes exposed
 */

import { describe, it, expect } from "vitest";
import { validateInternalPath } from "../../lib/safeNavigate";
import { SECURITY_CLAIM } from "../../lib/publicSecurityClaim";
import {
  platformNavItems,
  standaloneNavItems,
  businessNavItems,
  companyNavItems,
  allPublicNavItems,
} from "../../components/public/publicNavConfig";
import en from "../../i18n/en";
import sq from "../../i18n/sq";

// ── publicNavConfig ────────────────────────────────────────────────────────────

describe("publicNavConfig", () => {
  it("has at least 6 platform nav items", () => {
    expect(platformNavItems.length).toBeGreaterThanOrEqual(6);
  });

  it("canonical developers route is /platform/developers", () => {
    const devItem = platformNavItems.find((i) => i.href === "/platform/developers");
    expect(devItem).toBeDefined();
  });

  it("does NOT expose /developer (non-canonical route)", () => {
    const exposed = allPublicNavItems.some((i) => i.href === "/developer");
    expect(exposed).toBe(false);
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

  it("standalone nav contains pricing, security, lidhjet", () => {
    const hrefs = standaloneNavItems.map((i) => i.href);
    expect(hrefs).toContain("/pricing");
    expect(hrefs).toContain("/security");
    expect(hrefs).toContain("/lidhjet");
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

  it("accepts /login?returnTo=%2Fpricing (return-to URL)", () => {
    expect(validateInternalPath("/login?returnTo=%2Fpricing")).toBe(
      "/login?returnTo=%2Fpricing",
    );
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

  it("has a disclaimer that mentions ongoing verification", () => {
    expect(SECURITY_CLAIM.disclaimer.toLowerCase()).toContain("ongoing");
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
});
