import { useEffect } from "react";
import { getPublicLocaleOgValue } from "@/lib/publicLocale";
import {
  buildPolicyHreflangLinks,
  canonicalUrlForPath,
  getPublicSeoPolicy,
  getPublicSiteUrl,
  normalizePublicSiteUrl,
} from "@/lib/publicSeo";

export interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  /** Open Graph type, e.g. "website" or "article". */
  type?: string;
  noindex?: boolean;
  /** Optional factual JSON-LD structured data injected alongside public defaults. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function upsertLink(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement("link");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function removeStaleAlternateLinks(allowedHrefLangs: Set<string>) {
  document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]').forEach((link) => {
    const hrefLang = link.getAttribute("hreflang") || "";
    if (!allowedHrefLangs.has(hrefLang)) link.remove();
  });
}

function replaceSeoJsonLd(payloads: Array<Record<string, unknown>>) {
  document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((node) => node.remove());

  payloads.forEach((payload) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-jsonld", "true");
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);
  });
}

/**
 * Per-page SEO head manager for both public and private routes.
 * Public indexability/canonical/hreflang behavior is derived from the centralized
 * Wave 6 policy so blocked SQ content cannot accidentally advertise false parity.
 */
export function Seo({ title, description, canonical, type = "website", noindex, jsonLd }: SeoProps) {
  useEffect(() => {
    const previousTitle = document.title;
    const pathname = window.location.pathname;
    const policy = getPublicSeoPolicy(pathname);
    const siteOrigin = getPublicSiteUrl();
    const shouldIndex = policy.indexable && !noindex;
    const canonicalHref = canonical
      ? canonical.startsWith("http")
        ? canonical
        : `${normalizePublicSiteUrl(siteOrigin)}${canonical}`
      : canonicalUrlForPath(pathname, siteOrigin);

    document.title = title;
    document.documentElement.lang = policy.locale;

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: getPublicLocaleOgValue(policy.locale),
    });

    if (description) {
      upsertMeta('meta[name="description"]', { name: "description", content: description });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    }

    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: shouldIndex ? "index, follow" : "noindex, follow",
    });

    upsertLink('link[rel="canonical"]', { rel: "canonical", href: canonicalHref });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalHref });

    const hreflangLinks = shouldIndex
      ? buildPolicyHreflangLinks(pathname, siteOrigin)
      : policy.blockedSq
        ? buildPolicyHreflangLinks(pathname, siteOrigin)
        : [];
    const allowedHrefLangs = new Set(hreflangLinks.map(({ hrefLang }) => hrefLang));
    removeStaleAlternateLinks(allowedHrefLangs);
    hreflangLinks.forEach(({ hrefLang, href: altHref }) => {
      upsertLink(`link[rel="alternate"][hreflang="${hrefLang}"]`, {
        rel: "alternate",
        hreflang: hrefLang,
        href: altHref,
      });
    });

    const organization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pulse AI",
      url: `${siteOrigin}/en`,
    };
    const website = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pulse AI",
      url: `${siteOrigin}/en`,
      inLanguage: ["en", "sq"],
    };
    const webPage = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonicalHref,
      inLanguage: policy.locale,
      isPartOf: { "@type": "WebSite", name: "Pulse AI", url: `${siteOrigin}/en` },
    };
    const extraPayloads = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    replaceSeoJsonLd([organization, website, webPage, ...extraPayloads]);

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, canonical, type, noindex, jsonLd]);

  return null;
}

export default Seo;
