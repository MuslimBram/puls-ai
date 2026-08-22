import { useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  isSupportedPublicLocale,
  localizePublicPath,
  normalizePublicLocale,
  stripPublicLocale,
  type PublicLocale,
} from "@/lib/publicLocale";

export function usePublicLocale() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const locale: PublicLocale = isSupportedPublicLocale(params.locale)
    ? params.locale
    : normalizePublicLocale(params.locale);

  const localizedPath = useCallback(
    (path: string) => localizePublicPath(path, locale),
    [locale],
  );

  const switchLocale = useCallback(
    (nextLocale: PublicLocale) => {
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      navigate(localizePublicPath(currentPath, nextLocale));
    },
    [location.hash, location.pathname, location.search, navigate],
  );

  return {
    locale,
    localizedPath,
    switchLocale,
    publicPath: stripPublicLocale(`${location.pathname}${location.search}${location.hash}`),
  };
}
