import {
  DEFAULT_PUBLIC_LOCALE,
  isSupportedPublicLocale,
  localizePublicPath,
  normalizePublicPathname,
  stripPublicLocale,
} from "@/lib/publicLocale";
import type { PublicLocale } from "@/lib/publicLocale";

export const DEFAULT_PUBLIC_SITE_URL = "https://kohablerjeve.top";

export const BLOCKED_SQ_PATHS = new Set([
  "/white-label",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/affiliate-terms",
  "/refund",
  "/terms-and-payments",
]);

export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/about",
  "/contact",
  "/pricing",
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
  "/security",
  "/white-label",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/affiliate-terms",
  "/refund",
  "/terms-and-payments",
] as const;

export interface PublicSeoPolicy {
  locale: PublicLocale;
  strippedPath: string;
  indexable: boolean;
  blockedSq: boolean;
  canonicalPath: string;
  alternateLocales: PublicLocale[];
}

export function normalizePublicSiteUrl(raw?: string | null) {
  const candidate = (raw || DEFAULT_PUBLIC_SITE_URL).trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function isLocalDevelopmentOrigin(raw?: string | null) {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolvePublicSiteUrl(envUrl?: string | null, browserOrigin?: string | null) {
  if (envUrl) return normalizePublicSiteUrl(envUrl);

  // Keep localhost/dev tests truthful without allowing an arbitrary preview host
  // to become the public canonical origin when VITE_PUBLIC_SITE_URL is absent.
  if (isLocalDevelopmentOrigin(browserOrigin)) {
    return normalizePublicSiteUrl(browserOrigin);
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function getPublicSiteUrl() {
  const browserOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : undefined;

  return resolvePublicSiteUrl(import.meta.env?.VITE_PUBLIC_SITE_URL, browserOrigin);
}

export function getLocaleFromPublicPath(pathname: string): PublicLocale {
  const normalized = normalizePublicPathname(pathname);
  const candidate = normalized.split("/").filter(Boolean)[0];
  return isSupportedPublicLocale(candidate) ? candidate : DEFAULT_PUBLIC_LOCALE;
}

export function isKnownPublicIndexablePath(pathname: string) {
  const stripped = normalizePublicPathname(stripPublicLocale(pathname));
  return (PUBLIC_INDEXABLE_PATHS as readonly string[]).includes(stripped);
}

export function getPublicSeoPolicy(pathname: string): PublicSeoPolicy {
  const locale = getLocaleFromPublicPath(pathname);
  const strippedPath = normalizePublicPathname(stripPublicLocale(pathname));
  const knownPublic = isKnownPublicIndexablePath(strippedPath);
  const sqContentBlocked = BLOCKED_SQ_PATHS.has(strippedPath);
  const blockedSq = locale === "sq" && sqContentBlocked;
  const indexable = knownPublic && !blockedSq;

  return {
    locale,
    strippedPath,
    indexable,
    blockedSq,
    canonicalPath: blockedSq
      ? localizePublicPath(strippedPath, "en")
      : localizePublicPath(strippedPath, locale),
    alternateLocales: sqContentBlocked ? ["en"] : ["en", "sq"],
  };
}

export function buildPolicyHreflangLinks(pathname: string, origin: string) {
  const policy = getPublicSeoPolicy(pathname);
  if (!isKnownPublicIndexablePath(policy.strippedPath)) return [];

  const safeOrigin = normalizePublicSiteUrl(origin);
  const links = policy.alternateLocales.map((locale) => ({
    hrefLang: locale,
    href: `${safeOrigin}${localizePublicPath(policy.strippedPath, locale)}`,
  }));

  links.push({
    hrefLang: "x-default",
    href: `${safeOrigin}${localizePublicPath(policy.strippedPath, "en")}`,
  });

  return links;
}

export function canonicalUrlForPath(pathname: string, origin = getPublicSiteUrl()) {
  const policy = getPublicSeoPolicy(pathname);
  return `${normalizePublicSiteUrl(origin)}${policy.canonicalPath}`;
}
