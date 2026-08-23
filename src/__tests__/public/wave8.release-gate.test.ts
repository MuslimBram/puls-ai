import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BLOCKED_SQ_PATHS,
  DEFAULT_PUBLIC_SITE_URL,
  PUBLIC_INDEXABLE_PATHS,
  getPublicSeoPolicy,
  resolvePublicSiteUrl,
} from "@/lib/publicSeo";
import {
  buildRobotsTxt,
  buildSitemapXml,
  getIndexablePublicUrls,
} from "@/lib/publicDiscovery";

const ORIGIN = DEFAULT_PUBLIC_SITE_URL;

function localized(pathname: string, locale: "en" | "sq") {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

describe("Website Wave 8 final preview/release gate", () => {
  it("never promotes an arbitrary preview host to the public canonical origin", () => {
    expect(resolvePublicSiteUrl("https://example.com/", "https://preview.vercel.app")).toBe(
      "https://example.com",
    );
    expect(resolvePublicSiteUrl(undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(resolvePublicSiteUrl(undefined, "http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(resolvePublicSiteUrl(undefined, "https://pulse-ai-git-wave8.vercel.app")).toBe(
      DEFAULT_PUBLIC_SITE_URL,
    );
  });

  it("keeps every approved EN public route indexable with a self canonical", () => {
    for (const pathname of PUBLIC_INDEXABLE_PATHS) {
      const policy = getPublicSeoPolicy(localized(pathname, "en"));
      expect(policy.indexable, pathname).toBe(true);
      expect(policy.blockedSq, pathname).toBe(false);
      expect(policy.canonicalPath, pathname).toBe(localized(pathname, "en"));
    }
  });

  it("keeps only approved SQ route families indexable", () => {
    for (const pathname of PUBLIC_INDEXABLE_PATHS) {
      const policy = getPublicSeoPolicy(localized(pathname, "sq"));
      if (BLOCKED_SQ_PATHS.has(pathname)) {
        expect(policy.indexable, pathname).toBe(false);
        expect(policy.blockedSq, pathname).toBe(true);
        expect(policy.canonicalPath, pathname).toBe(localized(pathname, "en"));
        expect(policy.alternateLocales, pathname).toEqual(["en"]);
      } else {
        expect(policy.indexable, pathname).toBe(true);
        expect(policy.blockedSq, pathname).toBe(false);
        expect(policy.canonicalPath, pathname).toBe(localized(pathname, "sq"));
        expect(policy.alternateLocales, pathname).toEqual(["en", "sq"]);
      }
    }
  });

  it("indexes approved Albanian legal pages while keeping white-label blocked", () => {
    for (const pathname of [
      "/privacy",
      "/terms",
      "/cookies",
      "/dpa",
      "/affiliate-terms",
      "/refund",
      "/terms-and-payments",
    ]) {
      expect(BLOCKED_SQ_PATHS.has(pathname), pathname).toBe(false);
      expect(getPublicSeoPolicy(`/sq${pathname}`).indexable, pathname).toBe(true);
    }

    expect(BLOCKED_SQ_PATHS.has("/white-label")).toBe(true);
    expect(getPublicSeoPolicy("/sq/white-label").indexable).toBe(false);
  });

  it("sitemaps only eligible public discovery URLs and excludes blocked SQ variants", () => {
    const urls = getIndexablePublicUrls(ORIGIN);
    const sitemap = buildSitemapXml(ORIGIN);

    for (const pathname of PUBLIC_INDEXABLE_PATHS) {
      const en = `${ORIGIN}${localized(pathname, "en")}`;
      const sq = `${ORIGIN}${localized(pathname, "sq")}`;
      expect(urls, pathname).toContain(en);
      expect(sitemap, pathname).toContain(`<loc>${en}</loc>`);

      if (BLOCKED_SQ_PATHS.has(pathname)) {
        expect(urls, pathname).not.toContain(sq);
        expect(sitemap, pathname).not.toContain(`<loc>${sq}</loc>`);
      } else {
        expect(urls, pathname).toContain(sq);
        expect(sitemap, pathname).toContain(`<loc>${sq}</loc>`);
      }
    }

    expect(sitemap).not.toContain("/dashboard");
    expect(sitemap).not.toContain("/public-api");
    expect(sitemap).not.toContain("/auth/");
  });

  it("keeps private/authenticated surfaces out of crawler discovery", () => {
    const robots = buildRobotsTxt(ORIGIN);
    for (const prefix of [
      "/admin",
      "/app",
      "/auth",
      "/dashboard",
      "/inbox",
      "/leads",
      "/login",
      "/public-api",
      "/register",
      "/wallet",
    ]) {
      expect(robots).toContain(`Disallow: ${prefix}`);
    }
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("preserves the Wave 7 public/workspace trust boundary and canonical lead staging", () => {
    const backend = readFileSync(
      join(process.cwd(), "supabase", "functions", "public-lead-capture", "index.ts"),
      "utf-8",
    );
    const bot = readFileSync(
      join(process.cwd(), "src", "components", "FloatingAIBot.tsx"),
      "utf-8",
    );

    expect(backend).toContain('.from("public_leads")');
    expect(backend).toContain("resolveTrustedWorkspaceId: () => null");
    expect(backend).toContain("target_workspace_id: null");
    expect(backend).toContain('source === "live_demo" && body.privacy_consent !== true');
    expect(backend).not.toContain('.from("customer_memory")');
    expect(backend).not.toContain('.from("workspace_credentials")');

    expect(bot).toContain('supabase.functions.invoke("public-lead-capture"');
    expect(bot).toContain('source: "live_demo"');
    expect(bot).toContain("privacy_consent: true");
    expect(bot).toContain('localizedPath("/privacy")');
  });

  it("uses pulse-bos.com as the canonical public domain while retaining environment overrides", () => {
    const seo = readFileSync(join(process.cwd(), "src", "lib", "publicSeo.ts"), "utf-8");
    const vite = readFileSync(join(process.cwd(), "vite.config.ts"), "utf-8");
    const index = readFileSync(join(process.cwd(), "index.html"), "utf-8");

    expect(DEFAULT_PUBLIC_SITE_URL).toBe("https://pulse-bos.com");
    expect(seo).toContain("https://pulse-bos.com");
    expect(vite).toContain("https://pulse-bos.com");
    expect(index).toContain("%VITE_PUBLIC_SITE_URL%/en");
    expect(seo).not.toContain("https://kohablerjeve.top");
    expect(vite).not.toContain("https://kohablerjeve.top");
    expect(index).not.toContain("https://kohablerjeve.top");
  });
});
