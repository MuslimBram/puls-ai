import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import NotFound from "@/pages/NotFound";
import LocalizedPlatformPage from "@/pages/platform/LocalizedPlatformPage";
import {
  PUBLIC_LOCALE_STORAGE_KEY,
  getPreferredPublicLocale,
  getPublicLocaleOgValue,
  isLocalizablePublicPath,
  isSupportedPublicLocale,
  localizePublicPath,
  stripPotentialLocaleSegment,
  type PublicLocale,
} from "@/lib/publicLocale";

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attrs).forEach(([key, value]) => element?.setAttribute(key, value));
}

export default function PublicLocaleLayout() {
  const { i18n } = useTranslation();
  const { pathname, search, hash } = useLocation();
  const { locale = "" } = useParams();
  const isValidLocale = isSupportedPublicLocale(locale);
  const isLocaleLike = /^[a-z]{2}$/i.test(locale ?? "");

  const preferredLocale = getPreferredPublicLocale();
  const strippedPath = stripPotentialLocaleSegment(pathname);
  const fallbackTarget = isLocalizablePublicPath(strippedPath)
    ? localizePublicPath(`${strippedPath}${search}${hash}`, preferredLocale)
    : localizePublicPath("/", preferredLocale);

  useEffect(() => {
    if (!isValidLocale) return;
    const safeLocale = locale as PublicLocale;

    document.documentElement.lang = safeLocale;
    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: getPublicLocaleOgValue(safeLocale),
    });

    try {
      window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, safeLocale);
    } catch {
      // no-op
    }

    if (i18n.resolvedLanguage !== safeLocale && i18n.language !== safeLocale) {
      void i18n.changeLanguage(safeLocale);
    }
  }, [i18n, isValidLocale, locale]);

  if (!isValidLocale) {
    if (!isLocaleLike) return <NotFound />;
    return <Navigate to={fallbackTarget} replace />;
  }

  if (strippedPath === "/platform" || strippedPath.startsWith("/platform/")) {
    return <LocalizedPlatformPage slug={strippedPath.slice(1)} />;
  }

  return <Outlet />;
}
