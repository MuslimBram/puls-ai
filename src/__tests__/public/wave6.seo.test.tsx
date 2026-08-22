import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Seo } from "@/components/Seo";
import {
  BLOCKED_SQ_PATHS,
  buildPolicyHreflangLinks,
  canonicalUrlForPath,
  getPublicSeoPolicy,
} from "@/lib/publicSeo";

const ORIGIN = "https://kohablerjeve.top";

function setPath(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

function robotsContent() {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
}

function canonicalHref() {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");
}

function hreflangs() {
  return Array.from(document.head.querySelectorAll('link[rel="alternate"][hreflang]')).map((node) => ({
    lang: node.getAttribute("hreflang"),
    href: node.getAttribute("href"),
  }));
}

describe("Wave 6 public SEO policy", () => {
  beforeEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.documentElement.lang = "en";
    setPath("/en");
  });

  afterEach(() => cleanup());

  it("self-canonicalizes a fully localized EN route and emits EN/SQ/x-default", async () => {
    setPath("/en/platform/ai");
    render(<Seo title="AI | Pulse AI" description="AI description" />);

    await waitFor(() => expect(robotsContent()).toBe("index, follow"));
    expect(canonicalHref()).toBe(`${ORIGIN}/en/platform/ai`);
    expect(document.documentElement.lang).toBe("en");
    expect(hreflangs()).toEqual(
      expect.arrayContaining([
        { lang: "en", href: `${ORIGIN}/en/platform/ai` },
        { lang: "sq", href: `${ORIGIN}/sq/platform/ai` },
        { lang: "x-default", href: `${ORIGIN}/en/platform/ai` },
      ]),
    );
  });

  it("self-canonicalizes a fully localized SQ route and keeps locale-specific metadata", async () => {
    setPath("/sq/platform/crm");
    render(<Seo title="CRM | Pulse AI" description="Përshkrim" />);

    await waitFor(() => expect(robotsContent()).toBe("index, follow"));
    expect(canonicalHref()).toBe(`${ORIGIN}/sq/platform/crm`);
    expect(document.documentElement.lang).toBe("sq");
    expect(document.head.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe("sq_AL");
  });

  it.each(Array.from(BLOCKED_SQ_PATHS))(
    "keeps blocked SQ route %s accessible but noindex with EN canonical and no SQ hreflang",
    async (path) => {
      setPath(`/sq${path}`);
      render(<Seo title="Blocked SQ" description="English body pending approved SQ copy" />);

      await waitFor(() => expect(robotsContent()).toBe("noindex, follow"));
      expect(canonicalHref()).toBe(`${ORIGIN}/en${path}`);
      const links = hreflangs();
      expect(links).toEqual(
        expect.arrayContaining([
          { lang: "en", href: `${ORIGIN}/en${path}` },
          { lang: "x-default", href: `${ORIGIN}/en${path}` },
        ]),
      );
      expect(links.some((link) => link.lang === "sq")).toBe(false);
    },
  );

  it.each(Array.from(BLOCKED_SQ_PATHS))(
    "keeps EN route %s indexable without advertising a false SQ alternate",
    async (path) => {
      setPath(`/en${path}`);
      render(<Seo title="Approved EN" description="Approved English content" />);

      await waitFor(() => expect(robotsContent()).toBe("index, follow"));
      expect(canonicalHref()).toBe(`${ORIGIN}/en${path}`);
      const links = hreflangs();
      expect(links).toEqual(
        expect.arrayContaining([
          { lang: "en", href: `${ORIGIN}/en${path}` },
          { lang: "x-default", href: `${ORIGIN}/en${path}` },
        ]),
      );
      expect(links.some((link) => link.lang === "sq")).toBe(false);
    },
  );

  it("defaults unknown/private routes to noindex and emits no public hreflang", async () => {
    setPath("/dashboard");
    render(<Seo title="Dashboard" description="Private workspace" />);

    await waitFor(() => expect(robotsContent()).toBe("noindex, follow"));
    expect(hreflangs()).toEqual([]);
  });

  it("strips unsupported offers, ratings and reviews from custom structured data", async () => {
    setPath("/en");
    render(
      <Seo
        title="Pulse AI"
        description="The AI Business Operating System"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Pulse AI",
          offers: { "@type": "Offer", price: "99" },
          aggregateRating: { "@type": "AggregateRating", ratingValue: "5" },
          review: { "@type": "Review", reviewBody: "Example" },
        }}
      />,
    );

    await waitFor(() => {
      expect(document.head.querySelectorAll('script[data-seo-jsonld="true"]').length).toBeGreaterThan(0);
    });

    const jsonLdText = Array.from(document.head.querySelectorAll('script[data-seo-jsonld="true"]'))
      .map((node) => node.textContent || "")
      .join("\n");
    expect(jsonLdText).toContain("SoftwareApplication");
    expect(jsonLdText).not.toContain('"offers"');
    expect(jsonLdText).not.toContain('"aggregateRating"');
    expect(jsonLdText).not.toContain('"review"');
  });

  it("builds the expected canonical and hreflang policy without locale-cross canonical errors", () => {
    expect(getPublicSeoPolicy("/sq/security")).toMatchObject({
      locale: "sq",
      indexable: true,
      blockedSq: false,
      canonicalPath: "/sq/security",
    });
    expect(canonicalUrlForPath("/sq/security", ORIGIN)).toBe(`${ORIGIN}/sq/security`);
    expect(buildPolicyHreflangLinks("/sq/security", ORIGIN)).toHaveLength(3);
    expect(buildPolicyHreflangLinks("/en/privacy", ORIGIN)).toEqual([
      { hrefLang: "en", href: `${ORIGIN}/en/privacy` },
      { hrefLang: "x-default", href: `${ORIGIN}/en/privacy` },
    ]);
  });
});
