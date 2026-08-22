export const SUPPORTED_PUBLIC_LOCALES = ["en", "sq"] as const;

export type PublicLocale = (typeof SUPPORTED_PUBLIC_LOCALES)[number];

export const DEFAULT_PUBLIC_LOCALE: PublicLocale = "en";
export const PUBLIC_LOCALE_STORAGE_KEY = "pulse-language";

export const LOCALIZABLE_PUBLIC_PATHS = [
  "/",
  "/about",
  "/affiliate-terms",
  "/contact",
  "/cookies",
  "/dpa",
  "/platform",
  "/platform/ai",
  "/platform/analytics",
  "/platform/automation",
  "/platform/crm",
  "/platform/developers",
  "/platform/lidhjet",
  "/platform/marketing",
  "/platform/partners",
  "/platform/unified-inbox",
  "/pricing",
  "/privacy",
  "/refund",
  "/security",
  "/terms",
  "/terms-and-payments",
  "/white-label",
] as const;

const DUMMY_ORIGIN = "https://example.com";
const LOCALIZABLE_PUBLIC_PATH_SET = new Set(
  LOCALIZABLE_PUBLIC_PATHS.map((path) => normalizePublicPathname(path)),
);

function parseInternalPath(raw: string) {
  const resolved = new URL(raw || "/", DUMMY_ORIGIN);
  return {
    pathname: normalizePublicPathname(resolved.pathname),
    search: resolved.search,
    hash: resolved.hash,
  };
}

export function normalizePublicPathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

export function isSupportedPublicLocale(
  locale: string | null | undefined,
): locale is PublicLocale {
  return SUPPORTED_PUBLIC_LOCALES.includes(locale as PublicLocale);
}

export function normalizePublicLocale(
  locale: string | null | undefined,
): PublicLocale {
  const normalized = (locale ?? "").toLowerCase();
  const matched = SUPPORTED_PUBLIC_LOCALES.find(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`),
  );
  return matched ?? DEFAULT_PUBLIC_LOCALE;
}

export function stripPotentialLocaleSegment(pathname: string) {
  const normalizedPathname = normalizePublicPathname(pathname);
  const match = normalizedPathname.match(/^\/([^/]+)(?=\/|$)/);
  if (!match || !/^[a-z]{2}$/i.test(match[1])) return normalizedPathname;
  return normalizePublicPathname(normalizedPathname.slice(match[0].length) || "/");
}

export function stripPublicLocale(rawPath: string) {
  const { pathname, search, hash } = parseInternalPath(rawPath);
  const match = pathname.match(/^\/([^/]+)(?=\/|$)/);
  if (!match || !isSupportedPublicLocale(match[1])) {
    return `${pathname}${search}${hash}`;
  }

  const strippedPathname = normalizePublicPathname(pathname.slice(match[0].length) || "/");
  return `${strippedPathname}${search}${hash}`;
}

export function isLocalizablePublicPath(rawPath: string) {
  const { pathname } = parseInternalPath(stripPublicLocale(rawPath));
  return LOCALIZABLE_PUBLIC_PATH_SET.has(pathname);
}

export function localizePublicPath(rawPath: string, locale: string | null | undefined) {
  const safeLocale = normalizePublicLocale(locale);
  const { pathname, search, hash } = parseInternalPath(stripPublicLocale(rawPath));

  if (!LOCALIZABLE_PUBLIC_PATH_SET.has(pathname)) {
    return `${pathname}${search}${hash}`;
  }

  const localizedPathname = pathname === "/" ? `/${safeLocale}` : `/${safeLocale}${pathname}`;
  return `${localizedPathname}${search}${hash}`;
}

export function getPreferredPublicLocale(): PublicLocale {
  if (typeof window === "undefined") return DEFAULT_PUBLIC_LOCALE;

  try {
    const stored = window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY);
    if (isSupportedPublicLocale(stored)) return stored;

    const navigatorLocale = window.navigator.languages?.[0] ?? window.navigator.language;
    return normalizePublicLocale(navigatorLocale);
  } catch {
    return DEFAULT_PUBLIC_LOCALE;
  }
}

export function getPublicLocaleOgValue(locale: PublicLocale) {
  return locale === "sq" ? "sq_AL" : "en_US";
}

export function buildPublicHreflangLinks(path: string, origin: string) {
  const strippedPath = stripPublicLocale(path);
  if (!isLocalizablePublicPath(strippedPath)) return [];

  return [
    { hrefLang: "en", href: `${origin}${localizePublicPath(strippedPath, "en")}` },
    { hrefLang: "sq", href: `${origin}${localizePublicPath(strippedPath, "sq")}` },
    {
      hrefLang: "x-default",
      href: `${origin}${localizePublicPath(strippedPath, DEFAULT_PUBLIC_LOCALE)}`,
    },
  ];
}
