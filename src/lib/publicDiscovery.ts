import { BLOCKED_SQ_PATHS, PUBLIC_INDEXABLE_PATHS, normalizePublicSiteUrl } from "@/lib/publicSeo";
import { localizePublicPath } from "@/lib/publicLocale";

const PRIVATE_PREFIXES = [
  "/admin",
  "/app",
  "/auth",
  "/billing",
  "/business-profile",
  "/dashboard",
  "/inbox",
  "/leads",
  "/login",
  "/oauth",
  "/onboarding",
  "/partner",
  "/public-api",
  "/register",
  "/reset-password",
  "/settings",
  "/unsubscribe",
  "/wallet",
];

export function getIndexablePublicUrls(origin: string) {
  const safeOrigin = normalizePublicSiteUrl(origin);
  return PUBLIC_INDEXABLE_PATHS.flatMap((path) => {
    const en = `${safeOrigin}${localizePublicPath(path, "en")}`;
    if (BLOCKED_SQ_PATHS.has(path)) return [en];
    return [en, `${safeOrigin}${localizePublicPath(path, "sq")}`];
  });
}

export function buildSitemapXml(origin: string) {
  const urls = getIndexablePublicUrls(origin);
  const entries = urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildRobotsTxt(origin: string) {
  const safeOrigin = normalizePublicSiteUrl(origin);
  const disallow = PRIVATE_PREFIXES.map((path) => `Disallow: ${path}`).join("\n");
  return `# Pulse AI — generated public discovery policy\nUser-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${safeOrigin}/sitemap.xml\n`;
}

export function buildLlmsTxt(origin: string) {
  const safeOrigin = normalizePublicSiteUrl(origin);
  return `# Pulse AI\n\n> Pulse AI — The AI Business Operating System. One intelligent system to run, automate and grow your business.\n\n## Public discovery\n\n- English: ${safeOrigin}/en\n- Albanian: ${safeOrigin}/sq\n- Platform: ${safeOrigin}/en/platform\n- Pricing: ${safeOrigin}/en/pricing\n- Security: ${safeOrigin}/en/security\n\n## Localization note\n\nSome Albanian legal and white-label pages remain accessible but are intentionally excluded from indexing until approved Albanian body copy exists. No untranslated page is advertised as a full Albanian equivalent.\n`;
}
