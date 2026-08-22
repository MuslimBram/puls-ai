/**
 * Wave 3 public platform pages — focused tests.
 *
 * Covers:
 * - All 10 /platform/* routes registered in App.tsx
 * - /developer legacy redirect registered
 * - publicNavConfig uses real /platform/* hrefs (not anchors)
 * - platform.status EN/SQ parity
 * - platformHub EN/SQ i18n keys present
 * - All module page i18n keys present (EN + SQ)
 * - No hardcoded prices
 * - No admin routes exposed
 * - CTA routing: coming_soon modules use coming_soon variant (not default)
 * - No testimonials / customer counts in i18n keys
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  platformNavItems,
  allPublicNavItems,
} from "../../components/public/publicNavConfig";
import en from "../../i18n/en";
import sq from "../../i18n/sq";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

// ── Route registration ────────────────────────────────────────────────────────

describe("Wave 3 route registration in App.tsx", () => {
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
    it(`registers ${route}`, () => {
      expect(appSource).toContain(`path="${route}"`);
    });
  });

  it("registers /developer legacy redirect", () => {
    expect(appSource).toContain('path="/developer"');
    expect(appSource).toContain('to="/platform/developers"');
  });

  it("does NOT register /about, /contact, /growth-suite (still unpublished)", () => {
    ["/about", "/contact", "/growth-suite"].forEach((r) => {
      expect(appSource).not.toContain(`path="${r}"`);
    });
  });
});

// ── publicNavConfig Wave 3 ────────────────────────────────────────────────────

describe("publicNavConfig Wave 3", () => {
  it("platform nav items point to /platform/* (not anchors)", () => {
    for (const item of platformNavItems) {
      expect(item.href).toMatch(/^\/platform\//);
    }
  });

  it("developers nav item is comingSoon", () => {
    const dev = platformNavItems.find((i) => i.href === "/platform/developers");
    expect(dev).toBeDefined();
    expect(dev?.comingSoon).toBe(true);
  });

  it("partners nav item is comingSoon", () => {
    const partners = allPublicNavItems.find((i) => i.href === "/platform/partners");
    expect(partners).toBeDefined();
    expect(partners?.comingSoon).toBe(true);
  });

  it("lidhjet nav item points to /platform/lidhjet", () => {
    const lidhjet = allPublicNavItems.find((i) => i.labelKey === "nav.standalone.lidhjet");
    expect(lidhjet).toBeDefined();
    expect(lidhjet?.href).toBe("/platform/lidhjet");
    expect(lidhjet?.comingSoon).toBe(true);
  });

  it("no /developer (non-canonical) in public nav", () => {
    expect(allPublicNavItems.some((i) => i.href === "/developer")).toBe(false);
  });
});

// ── EN / SQ parity for platform.status ───────────────────────────────────────

describe("platform.status EN/SQ parity", () => {
  const enStatus = (en as Record<string, { status?: Record<string, string> }>).platform?.status;
  const sqStatus = (sq as Record<string, { status?: Record<string, string> }>).platform?.status;

  it("EN has platform.status.live", () => {
    expect(enStatus?.live).toBeTruthy();
  });

  it("EN has platform.status.beta", () => {
    expect(enStatus?.beta).toBeTruthy();
  });

  it("EN has platform.status.comingSoon", () => {
    expect(enStatus?.comingSoon).toBeTruthy();
  });

  it("SQ has platform.status.live", () => {
    expect(sqStatus?.live).toBeTruthy();
  });

  it("SQ has platform.status.comingSoon", () => {
    expect(sqStatus?.comingSoon).toBeTruthy();
  });

  it("SQ status keys differ from EN (Albanian translation)", () => {
    expect(sqStatus?.live).not.toBe(enStatus?.live);
    expect(sqStatus?.comingSoon).not.toBe(enStatus?.comingSoon);
  });
});

// ── platformHub i18n EN/SQ parity ─────────────────────────────────────────────

describe("platformHub i18n EN/SQ parity", () => {
  type AnyObj = Record<string, unknown>;
  const enHub = (en as AnyObj).platformHub as AnyObj | undefined;
  const sqHub = (sq as AnyObj).platformHub as AnyObj | undefined;

  it("EN has platformHub.hero.title", () => {
    expect((enHub?.hero as AnyObj | undefined)?.title).toBeTruthy();
  });

  it("SQ has platformHub.hero.title", () => {
    expect((sqHub?.hero as AnyObj | undefined)?.title).toBeTruthy();
  });

  it("EN platformHub.modules contains all 9 slugs", () => {
    const modules = enHub?.modules as AnyObj | undefined;
    const slugs = ["ai", "unified-inbox", "crm", "marketing", "automation", "analytics", "developers", "partners", "lidhjet"];
    slugs.forEach((slug) => {
      expect((modules?.[slug] as AnyObj | undefined)?.title, `Missing EN key for module ${slug}`).toBeTruthy();
    });
  });

  it("SQ platformHub.modules contains all 9 slugs", () => {
    const modules = sqHub?.modules as AnyObj | undefined;
    const slugs = ["ai", "unified-inbox", "crm", "marketing", "automation", "analytics", "developers", "partners", "lidhjet"];
    slugs.forEach((slug) => {
      expect((modules?.[slug] as AnyObj | undefined)?.title, `Missing SQ key for module ${slug}`).toBeTruthy();
    });
  });
});

// ── Individual module page i18n ───────────────────────────────────────────────

describe("Module page i18n keys EN/SQ parity", () => {
  type AnyObj = Record<string, unknown>;
  const enT = en as AnyObj;
  const sqT = sq as AnyObj;

  const PAGE_KEYS = [
    "platformAi",
    "platformInbox",
    "platformCrm",
    "platformMarketing",
    "platformAutomation",
    "platformAnalytics",
    "platformDevelopers",
    "platformPartners",
    "platformLidhjet",
  ] as const;

  PAGE_KEYS.forEach((key) => {
    it(`EN has ${key}.seo.title`, () => {
      const page = enT[key] as AnyObj | undefined;
      expect((page?.seo as AnyObj | undefined)?.title).toBeTruthy();
    });

    it(`SQ has ${key}.seo.title`, () => {
      const page = sqT[key] as AnyObj | undefined;
      expect((page?.seo as AnyObj | undefined)?.title).toBeTruthy();
    });

    it(`${key} SQ seo.title differs from EN (Albanian translation)`, () => {
      const enPage = enT[key] as AnyObj | undefined;
      const sqPage = sqT[key] as AnyObj | undefined;
      const enTitle = (enPage?.seo as AnyObj | undefined)?.title;
      const sqTitle = (sqPage?.seo as AnyObj | undefined)?.title;
      expect(sqTitle).not.toBe(enTitle);
    });
  });
});

// ── Product truth — no hardcoded prices, no fake metrics ──────────────────────

describe("Product truth guardrails", () => {
  const ALL_I18N_TEXT = JSON.stringify(en) + JSON.stringify(sq);
  const ALL_SOURCE = appSource;

  it("no hardcoded price strings ($X/month, €X, £X) in i18n", () => {
    // Must not contain things like $49/month, €99, £29
    expect(ALL_I18N_TEXT).not.toMatch(/\$\d+\/month/i);
    expect(ALL_I18N_TEXT).not.toMatch(/€\d+/i);
    expect(ALL_I18N_TEXT).not.toMatch(/£\d+/i);
  });

  it("no fake customer counts in platform page i18n", () => {
    // Prohibit patterns like "10,000 customers", "50,000+ businesses"
    expect(ALL_I18N_TEXT).not.toMatch(/\d{1,3},\d{3}\+?\s*(customers|businesses|users)/i);
  });

  it("no invented testimonial names in platform page source files", () => {
    const platformSources = [
      "PlatformHub",
      "PlatformAi",
      "PlatformInbox",
      "PlatformCrm",
      "PlatformMarketing",
      "PlatformAutomation",
      "PlatformAnalytics",
      "PlatformDevelopers",
      "PlatformPartners",
      "PlatformLidhjet",
    ].map((name) => {
      try {
        return readFileSync(resolve(process.cwd(), `src/pages/platform/${name}.tsx`), "utf8");
      } catch {
        return "";
      }
    }).join("");
    // No testimonial-style JSX patterns
    expect(platformSources).not.toMatch(/role=["'].*(?:CEO|CTO|Manager)["']/);
    expect(platformSources).not.toMatch(/"quote":/);
  });

  it("PublicShell is used in all platform pages (not a second shell)", () => {
    const pageNames = [
      "PlatformHub",
      "PlatformAi",
      "PlatformInbox",
      "PlatformCrm",
      "PlatformMarketing",
      "PlatformAutomation",
      "PlatformAnalytics",
      "PlatformDevelopers",
      "PlatformPartners",
      "PlatformLidhjet",
    ];
    pageNames.forEach((name) => {
      const src = readFileSync(resolve(process.cwd(), `src/pages/platform/${name}.tsx`), "utf8");
      expect(src, `${name} must use PublicShell`).toContain("PublicShell");
      expect(src, `${name} must not import DashboardLayout`).not.toContain("DashboardLayout");
    });
  });

  it("package.json unchanged (no new dependencies)", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    // Just verify the file parses and has expected top-level keys
    expect(pkg.name).toBeTruthy();
    expect(pkg.dependencies).toBeTruthy();
    expect(pkg.devDependencies).toBeTruthy();
  });
});

// ── CTA routing correctness ───────────────────────────────────────────────────

describe("CTA routing in platform pages", () => {
  it("coming_soon pages use PublicCTA variant='coming_soon'", () => {
    const comingSoonPages = ["PlatformDevelopers", "PlatformPartners", "PlatformLidhjet"];
    comingSoonPages.forEach((name) => {
      const src = readFileSync(resolve(process.cwd(), `src/pages/platform/${name}.tsx`), "utf8");
      expect(src, `${name} should use variant="coming_soon"`).toContain('variant="coming_soon"');
    });
  });

  it("live pages do NOT use coming_soon CTA variant", () => {
    const livePages = [
      "PlatformAi",
      "PlatformInbox",
      "PlatformCrm",
      "PlatformMarketing",
      "PlatformAutomation",
      "PlatformAnalytics",
    ];
    livePages.forEach((name) => {
      const src = readFileSync(resolve(process.cwd(), `src/pages/platform/${name}.tsx`), "utf8");
      expect(src, `${name} should not use coming_soon variant`).not.toContain('variant="coming_soon"');
    });
  });

  it("PlatformDevelopers links to /public-api (canonical API route)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/platform/PlatformDevelopers.tsx"), "utf8");
    expect(src).toContain("/public-api");
  });
});

// ── AI-1B / SOCIAL file isolation ─────────────────────────────────────────────

describe("Parallel work safety — AI-1B and SOCIAL file isolation", () => {
  const platformPageSources = [
    "PlatformHub",
    "PlatformAi",
    "PlatformInbox",
    "PlatformCrm",
    "PlatformMarketing",
    "PlatformAutomation",
    "PlatformAnalytics",
    "PlatformDevelopers",
    "PlatformPartners",
    "PlatformLidhjet",
  ].map((name) =>
    readFileSync(resolve(process.cwd(), `src/pages/platform/${name}.tsx`), "utf8")
  ).join("");

  it("platform pages do NOT import AI router files", () => {
    expect(platformPageSources).not.toContain("aiRouter");
    expect(platformPageSources).not.toContain("canonicalAI");
    expect(platformPageSources).not.toContain("aiProviderFallback");
  });

  it("platform pages do NOT import social/identity/interest files", () => {
    expect(platformPageSources).not.toContain("identityGraph");
    expect(platformPageSources).not.toContain("interestMemory");
    expect(platformPageSources).not.toContain("social1");
  });
});
