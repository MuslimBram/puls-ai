import { useEffect } from "react";
import { buildPublicHreflangLinks } from "@/lib/publicLocale";

export interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  /** Open Graph type, e.g. "website" or "article". */
  type?: string;
  noindex?: boolean;
  /** Optional JSON-LD structured data injected as application/ld+json. */
  jsonLd?: Record<string, unknown>;
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

/**
 * Per-page SEO head manager. Sets title, description, canonical,
 * Open Graph / Twitter tags and optional JSON-LD, and restores the
 * previous title on unmount.
 */
export function Seo({ title, description, canonical, type = "website", noindex, jsonLd }: SeoProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });

    if (description) {
      upsertMeta('meta[name="description"]', { name: "description", content: description });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    }

    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow",
    });

    const href = canonical || window.location.origin + window.location.pathname;
    upsertLink('link[rel="canonical"]', { rel: "canonical", href });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: href });

    const hreflangLinks = buildPublicHreflangLinks(window.location.pathname, window.location.origin);
    hreflangLinks.forEach(({ hrefLang, href: altHref }) => {
      upsertLink(`link[rel="alternate"][hreflang="${hrefLang}"]`, {
        rel: "alternate",
        hreflang: hrefLang,
        href: altHref,
      });
    });

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo-jsonld", "true");
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = previousTitle;
      if (script) script.remove();
    };
  }, [title, description, canonical, type, noindex, jsonLd]);

  return null;
}

export default Seo;
