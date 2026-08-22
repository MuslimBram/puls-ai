/**
 * Breadcrumbs — semantic breadcrumb navigation for public pages.
 *
 * Auto-generates breadcrumbs from the current pathname.
 * Supports explicit override via `items` prop.
 */

import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { usePublicLocale } from "@/hooks/usePublicLocale";
import { stripPublicLocale } from "@/lib/publicLocale";
import { getPublicSiteUrl } from "@/lib/publicSeo";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  /** Explicit items. If omitted, auto-generated from pathname. */
  items?: BreadcrumbItem[];
  className?: string;
}

/** Convert a URL segment like "ai-intelligence" → "AI Intelligence" */
function segmentToLabel(segment: string): string {
  return segment
    .split("-")
    .map((word) => {
      if (word.toUpperCase() === word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Build breadcrumb items from a pathname like /platform/ai-intelligence */
function pathnameToBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = stripPublicLocale(pathname).split("/").filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  let cumulative = "";
  segments.forEach((seg, idx) => {
    cumulative += `/${seg}`;
    const isLast = idx === segments.length - 1;
    crumbs.push({
      label: segmentToLabel(seg),
      href: isLast ? undefined : cumulative,
    });
  });
  return crumbs;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();

  const crumbs = useMemo(() => items ?? pathnameToBreadcrumbs(pathname), [items, pathname]);

  useEffect(() => {
    document.head.querySelectorAll('script[data-breadcrumb-jsonld="true"]').forEach((node) => node.remove());
    if (crumbs.length <= 1) return;

    const origin = getPublicSiteUrl();
    const payload = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.label,
        item: `${origin}${crumb.href ? localizedPath(crumb.href) : pathname}`,
      })),
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-breadcrumb-jsonld", "true");
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);

    return () => script.remove();
  }, [crumbs, localizedPath, pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label={t("breadcrumbs.label", { defaultValue: "Breadcrumb" })} className={cn("", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === crumbs.length - 1;
          const key = crumb.href ?? crumb.label;
          return (
            <li key={key} className="flex items-center gap-1">
              {!isFirst && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
              )}
              {isLast || !crumb.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "max-w-[200px] truncate",
                    isLast ? "font-medium text-foreground" : "",
                  )}
                >
                  {isFirst ? (
                    <span className="flex items-center gap-1">
                      <Home className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{crumb.label}</span>
                    </span>
                  ) : (
                    crumb.label
                  )}
                </span>
              ) : (
                <Link
                  to={localizedPath(crumb.href)}
                  className="max-w-[200px] truncate underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                >
                  {isFirst ? (
                    <span className="flex items-center gap-1">
                      <Home className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{crumb.label}</span>
                    </span>
                  ) : (
                    crumb.label
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
