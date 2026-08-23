import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  getIndexablePublicUrls,
} from "@/lib/publicDiscovery";

const ORIGIN = "https://pulse-bos.com";

describe("Wave 6 public discovery", () => {
  it("publishes exactly the eligible bilingual/EN-only discovery URLs", () => {
    const urls = getIndexablePublicUrls(ORIGIN);
    expect(urls).toHaveLength(45);
    expect(urls).toContain(`${ORIGIN}/en`);
    expect(urls).toContain(`${ORIGIN}/sq`);
    expect(urls).toContain(`${ORIGIN}/en/platform/lidhjet`);
    expect(urls).toContain(`${ORIGIN}/sq/platform/lidhjet`);
    expect(urls).toContain(`${ORIGIN}/en/privacy`);
    expect(urls).toContain(`${ORIGIN}/sq/privacy`);
    expect(urls).not.toContain(`${ORIGIN}/sq/white-label`);
  });

  it("keeps private/auth/admin routes out of the sitemap", () => {
    const sitemap = buildSitemapXml(ORIGIN);
    expect(sitemap).toContain(`${ORIGIN}/en/security`);
    expect(sitemap).toContain(`${ORIGIN}/sq/security`);
    expect(sitemap).not.toContain("/dashboard");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/login");
    expect(sitemap).not.toContain("/register");
    expect(sitemap).not.toContain("/public-api");
    expect(sitemap).toContain(`${ORIGIN}/sq/terms`);
  });

  it("allows public crawling while disallowing private route prefixes", () => {
    const robots = buildRobotsTxt(ORIGIN);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /dashboard");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /public-api");
    expect(robots).not.toContain("Disallow: /security");
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("documents machine-readable discovery without fabricated pricing or full-SQ claims", () => {
    const llms = buildLlmsTxt(ORIGIN);
    expect(llms).toContain("The AI Business Operating System");
    expect(llms).toContain("white-label page remains intentionally excluded from indexing");
    expect(llms).not.toMatch(/€\s*\d+/);
    expect(llms).not.toMatch(/\$\s*\d+/);
    expect(llms).not.toContain("SOC 2 certified");
    expect(llms).not.toContain("ISO 27001 certified");
  });

  it("removes legacy static discovery files because build output is config-driven", () => {
    expect(existsSync(resolve(process.cwd(), "public/robots.txt"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "public/sitemap.xml"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "public/llms.txt"))).toBe(false);

    const viteSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(viteSource).toContain('fileName: "robots.txt"');
    expect(viteSource).toContain('fileName: "sitemap.xml"');
    expect(viteSource).toContain('fileName: "llms.txt"');
    expect(viteSource).toContain("VITE_PUBLIC_SITE_URL");
  });

  it("removes unsupported static schema and unverified social-account claims from index.html", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).not.toContain("aggregateRating");
    expect(html).not.toContain("FAQPage");
    expect(html).not.toContain('"offers"');
    expect(html).not.toContain('name="twitter:site"');
    expect(html).not.toContain('name="twitter:creator"');
    expect(html).not.toContain("REPLACE_WITH_YOUR_GSC_VERIFICATION_CODE");
  });

  it("routes legal SEO through the same centralized truth-aware head manager", () => {
    const legalLayout = readFileSync(
      resolve(process.cwd(), "src/components/legal/LegalLayout.tsx"),
      "utf8",
    );
    expect(legalLayout).toContain("<Seo");
    expect(legalLayout).not.toContain('content: "index, follow"');
    expect(legalLayout).not.toContain("buildPublicHreflangLinks");
  });
});
