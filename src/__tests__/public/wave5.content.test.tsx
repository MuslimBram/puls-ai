/**
 * Wave 5 — EN/SQ content parity tests.
 *
 * Covers:
 * - Static i18n key parity: every in-scope public page has both EN and SQ keys,
 *   and SQ values differ from EN (confirming real translation, not copy-paste).
 * - Render tests: representative user-visible content on key public surfaces
 *   renders the correct language string and does NOT leak the opposing language.
 * - Content audit: i18n-wired platform pages do not have hardcoded English prose
 *   in their TSX source files.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import PublicLocaleLayout from "@/components/public/PublicLocaleLayout";
import { GlobalFooter } from "@/components/GlobalFooter";
import PlatformHub from "@/pages/platform/PlatformHub";
import PlatformAi from "@/pages/platform/PlatformAi";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import i18n from "@/i18n";
import en from "@/i18n/en";
import sq from "@/i18n/sq";

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: null, user: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {},
    functions: { invoke: vi.fn() },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

function getDeep(obj: AnyObj, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as AnyObj)[key];
    return undefined;
  }, obj);
}

function renderLocalized(locale: string, element: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[`/${locale}`]}>
        <Routes>
          <Route path="/:locale" element={<PublicLocaleLayout />}>
            <Route index element={element} />
          </Route>
        </Routes>
        <GlobalFooter />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function renderLocalizedSub(locale: string, subPath: string, element: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[`/${locale}/${subPath}`]}>
        <Routes>
          <Route path="/:locale" element={<PublicLocaleLayout />}>
            <Route path={subPath} element={element} />
          </Route>
        </Routes>
        <GlobalFooter />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

// ── 1. Static i18n key parity ─────────────────────────────────────────────────

describe("Wave 5 — static i18n key parity for in-scope public pages", () => {
  const enT = en as AnyObj;
  const sqT = sq as AnyObj;

  const PAGE_KEYS = [
    "platformHub",
    "platformAi",
    "platformInbox",
    "platformCrm",
    "platformMarketing",
    "platformAutomation",
    "platformAnalytics",
    "platformDevelopers",
    "platformPartners",
    "platformLidhjet",
    "securityPage",
    "pricingPage",
    "whiteLabelPage",
  ] as const;

  PAGE_KEYS.forEach((key) => {
    it(`EN has ${key}.hero.title`, () => {
      const page = enT[key] as AnyObj | undefined;
      const hero = page?.hero as AnyObj | undefined;
      expect(hero?.title, `Missing EN ${key}.hero.title`).toBeTruthy();
    });

    it(`SQ has ${key}.hero.title`, () => {
      const page = sqT[key] as AnyObj | undefined;
      const hero = page?.hero as AnyObj | undefined;
      expect(hero?.title, `Missing SQ ${key}.hero.title`).toBeTruthy();
    });

    it(`SQ ${key}.hero.title differs from EN (actual translation)`, () => {
      const enHero = ((enT[key] as AnyObj | undefined)?.hero as AnyObj | undefined)?.title;
      const sqHero = ((sqT[key] as AnyObj | undefined)?.hero as AnyObj | undefined)?.title;
      expect(sqHero, `SQ ${key}.hero.title must not be identical to EN`).not.toBe(enHero);
    });
  });

  it("nav.company.about differs EN vs SQ", () => {
    expect(getDeep(sqT, "nav.company.about")).not.toBe(getDeep(enT, "nav.company.about"));
  });

  it("nav.company.contact differs EN vs SQ", () => {
    expect(getDeep(sqT, "nav.company.contact")).not.toBe(getDeep(enT, "nav.company.contact"));
  });

  it("footer.tagline differs EN vs SQ", () => {
    expect(getDeep(sqT, "footer.tagline")).not.toBe(getDeep(enT, "footer.tagline"));
  });

  it("trust.dataControl differs EN vs SQ", () => {
    expect(getDeep(sqT, "trust.dataControl")).not.toBe(getDeep(enT, "trust.dataControl"));
  });
});

// ── 2. Render: PlatformHub EN/SQ content parity ───────────────────────────────

describe("Wave 5 — PlatformHub render parity", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    document.head.innerHTML = "";
    await i18n.changeLanguage("en");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("/en/platform renders English hero title", async () => {
    renderLocalizedSub("en", "platform", <PlatformHub />);
    expect(await screen.findByRole("heading", { name: "One Platform. Every Business Tool You Need." }))
      .toBeInTheDocument();
  });

  it("/sq/platform renders Albanian hero title", async () => {
    renderLocalizedSub("sq", "platform", <PlatformHub />);
    expect(await screen.findByRole("heading", { name: "Një Platformë. Çdo Mjet Biznesi që Keni Nevojë." }))
      .toBeInTheDocument();
  });

  it("/sq/platform does NOT render English hero title", async () => {
    renderLocalizedSub("sq", "platform", <PlatformHub />);
    await screen.findByRole("heading", { name: "Një Platformë. Çdo Mjet Biznesi që Keni Nevojë." });
    expect(screen.queryByRole("heading", { name: "One Platform. Every Business Tool You Need." }))
      .not.toBeInTheDocument();
  });
});

// ── 3. Render: PlatformAi EN/SQ content parity ───────────────────────────────

describe("Wave 5 — PlatformAi render parity", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    await i18n.changeLanguage("en");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("/en/platform/ai renders English hero title", async () => {
    renderLocalizedSub("en", "platform/ai", <PlatformAi />);
    expect(await screen.findByRole("heading", { name: "AI Intelligence Built for Business" }))
      .toBeInTheDocument();
  });

  it("/sq/platform/ai renders Albanian hero title", async () => {
    renderLocalizedSub("sq", "platform/ai", <PlatformAi />);
    expect(await screen.findByRole("heading", { name: "Inteligjencë AI e Ndërtuar për Biznesin" }))
      .toBeInTheDocument();
  });

  it("/sq/platform/ai does NOT render English hero title", async () => {
    renderLocalizedSub("sq", "platform/ai", <PlatformAi />);
    await screen.findByRole("heading", { name: "Inteligjencë AI e Ndërtuar për Biznesin" });
    expect(screen.queryByRole("heading", { name: "AI Intelligence Built for Business" }))
      .not.toBeInTheDocument();
  });
});

// ── 4. Render: About page EN/SQ content parity ───────────────────────────────

describe("Wave 5 — About page render parity", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    await i18n.changeLanguage("en");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("/en/about renders English section title heading", async () => {
    renderLocalizedSub("en", "about", <About />);
    expect(
      await screen.findByRole("heading", { name: "The AI Business Operating System" }),
    ).toBeInTheDocument();
  });

  it("/sq/about renders Albanian section title heading", async () => {
    renderLocalizedSub("sq", "about", <About />);
    expect(
      await screen.findByRole("heading", { name: "Sistemi Operativ i Biznesit me AI" }),
    ).toBeInTheDocument();
  });

  it("/sq/about does NOT render English section title heading", async () => {
    renderLocalizedSub("sq", "about", <About />);
    await screen.findByRole("heading", { name: "Sistemi Operativ i Biznesit me AI" });
    expect(
      screen.queryByRole("heading", { name: "The AI Business Operating System" }),
    ).not.toBeInTheDocument();
  });
});

// ── 5. Render: Contact page EN/SQ content parity ─────────────────────────────

describe("Wave 5 — Contact page render parity", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    await i18n.changeLanguage("en");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("/en/contact renders English lead form submit button", async () => {
    renderLocalizedSub("en", "contact", <Contact />);
    expect(
      await screen.findByRole("button", { name: "Send request" }),
    ).toBeInTheDocument();
  });

  it("/sq/contact renders Albanian lead form submit button", async () => {
    renderLocalizedSub("sq", "contact", <Contact />);
    expect(
      await screen.findByRole("button", { name: "Dërgo kërkesën" }),
    ).toBeInTheDocument();
  });

  it("/sq/contact does NOT render English submit button text", async () => {
    renderLocalizedSub("sq", "contact", <Contact />);
    await screen.findByRole("button", { name: "Dërgo kërkesën" });
    expect(
      screen.queryByRole("button", { name: "Send request" }),
    ).not.toBeInTheDocument();
  });
});

// ── 6. Render: navigation footer locale parity ───────────────────────────────

describe("Wave 5 — public navigation/footer locale parity", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    await i18n.changeLanguage("en");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("/en shows English nav pricing link", async () => {
    renderLocalizedSub("en", "platform", <PlatformHub />);
    await screen.findByRole("heading", { name: "One Platform. Every Business Tool You Need." });
    const pricingLinks = screen.getAllByRole("link", { name: "Pricing" });
    expect(pricingLinks.length).toBeGreaterThan(0);
  });

  it("/sq shows Albanian nav pricing link", async () => {
    renderLocalizedSub("sq", "platform", <PlatformHub />);
    await screen.findByRole("heading", { name: "Një Platformë. Çdo Mjet Biznesi që Keni Nevojë." });
    const pricingLinks = screen.getAllByRole("link", { name: "Çmimet" });
    expect(pricingLinks.length).toBeGreaterThan(0);
  });

  it("/sq footer tagline renders Albanian copy", async () => {
    renderLocalizedSub("sq", "platform", <PlatformHub />);
    await screen.findByRole("heading", { name: "Një Platformë. Çdo Mjet Biznesi që Keni Nevojë." });
    expect(screen.getByText("Një sistem inteligjent për të drejtuar, automatizuar dhe rritur biznesin tuaj."))
      .toBeInTheDocument();
  });

  it("/sq footer does NOT show EN tagline", async () => {
    renderLocalizedSub("sq", "platform", <PlatformHub />);
    await screen.findByRole("heading", { name: "Një Platformë. Çdo Mjet Biznesi që Keni Nevojë." });
    expect(screen.queryByText("One intelligent system to run, automate and grow your business."))
      .not.toBeInTheDocument();
  });
});

// ── 7. Static content audit: platform page source files ───────────────────────

describe("Wave 5 — platform page source files have no user-visible hardcoded English prose", () => {
  const PLATFORM_PAGE_NAMES = [
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

  PLATFORM_PAGE_NAMES.forEach((name) => {
    it(`${name}.tsx uses t() for all user-visible prose (no raw JSX text longer than 3 words)`, () => {
      const src = readFileSync(
        resolve(process.cwd(), `src/pages/platform/${name}.tsx`),
        "utf8",
      );
      // Remove import/comment/string-inside-t() blocks; look for JSX text content
      // Flag patterns like >Some Long English Phrase< that are not inside t() calls
      const jsxTextPattern = />([A-Z][a-z]+(?:\s+[a-zA-Z]+){2,})</g;
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = jsxTextPattern.exec(src)) !== null) {
        // Ignore lines that are comments or inside className/aria strings
        const line = src.substring(Math.max(0, m.index - 50), m.index + m[0].length + 50);
        if (!line.includes("//") && !line.includes("className") && !line.includes("aria-")) {
          matches.push(m[1]);
        }
      }
      expect(
        matches,
        `${name}.tsx has hardcoded English prose in JSX: ${matches.join(", ")}`,
      ).toHaveLength(0);
    });
  });
});

// ── 8. i18n key completeness: all in-scope pages have required keys ───────────

describe("Wave 5 — all in-scope public page i18n keys are complete", () => {
  const enT = en as AnyObj;
  const sqT = sq as AnyObj;

  const REQUIRED_KEYS: Array<[string, string]> = [
    // homepage
    ["homepage.hero.title",          "homepage.hero.title"],
    ["homepage.seo.title",           "homepage.seo.title"],
    // platform hub + all modules
    ["platformHub.hero.title",       "platformHub.hero.title"],
    ["platformHub.cta.title",        "platformHub.cta.title"],
    ["platformAi.hero.title",        "platformAi.hero.title"],
    ["platformInbox.hero.title",     "platformInbox.hero.title"],
    ["platformCrm.hero.title",       "platformCrm.hero.title"],
    ["platformMarketing.hero.title", "platformMarketing.hero.title"],
    ["platformAutomation.hero.title","platformAutomation.hero.title"],
    ["platformAnalytics.hero.title", "platformAnalytics.hero.title"],
    ["platformDevelopers.hero.title","platformDevelopers.hero.title"],
    ["platformPartners.hero.title",  "platformPartners.hero.title"],
    ["platformLidhjet.hero.title",   "platformLidhjet.hero.title"],
    // pricing
    ["pricingPage.hero.title",       "pricingPage.hero.title"],
    ["pricingPage.canonicalSource",  "pricingPage.canonicalSource"],
    // security
    ["securityPage.hero.title",      "securityPage.hero.title"],
    ["securityPage.pillars.heading", "securityPage.pillars.heading"],
    // white-label
    ["whiteLabelPage.hero.title",    "whiteLabelPage.hero.title"],
    ["whiteLabelPage.applyNote",     "whiteLabelPage.applyNote"],
    // nav/footer
    ["nav.standalone.pricing",       "nav.standalone.pricing"],
    ["nav.standalone.security",      "nav.standalone.security"],
    ["nav.company.about",            "nav.company.about"],
    ["nav.company.contact",          "nav.company.contact"],
    ["footer.tagline",               "footer.tagline"],
    ["footer.links.privacy",         "footer.links.privacy"],
    ["footer.links.terms",           "footer.links.terms"],
    // trust
    ["trust.dataControl",            "trust.dataControl"],
    ["trust.securityLink",           "trust.securityLink"],
  ];

  REQUIRED_KEYS.forEach(([key]) => {
    it(`EN has ${key}`, () => {
      expect(getDeep(enT, key), `Missing EN key: ${key}`).toBeTruthy();
    });

    it(`SQ has ${key}`, () => {
      expect(getDeep(sqT, key), `Missing SQ key: ${key}`).toBeTruthy();
    });
  });

  it("SQ pricing nav label differs from EN", () => {
    expect(getDeep(sqT, "nav.standalone.pricing")).not.toBe(getDeep(enT, "nav.standalone.pricing"));
  });

  it("SQ footer links.privacy differs from EN", () => {
    expect(getDeep(sqT, "footer.links.privacy")).not.toBe(getDeep(enT, "footer.links.privacy"));
  });

  it("SQ trust.securityLink differs from EN", () => {
    expect(getDeep(sqT, "trust.securityLink")).not.toBe(getDeep(enT, "trust.securityLink"));
  });
});
