const SUPPORTED_LOCALES = ["en", "sq"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const COUNTRY_TO_LOCALE: Record<string, SupportedLocale> = {
  AL: "sq",
  XK: "sq",
};

export function detectPreferredLocale(): SupportedLocale {
  const stored = localStorage.getItem("pulse_locale");
  if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) return stored as SupportedLocale;

  const browser = navigator.language?.split("-")[0]?.toLowerCase();
  if (browser && SUPPORTED_LOCALES.includes(browser as SupportedLocale)) return browser as SupportedLocale;

  // The application may provide a coarse country hint from its edge layer.
  // Never infer or expose a precise location in the browser.
  const country = document.documentElement.dataset.countryCode?.toUpperCase();
  return COUNTRY_TO_LOCALE[country] ?? "en";
}

export function persistLocale(locale: SupportedLocale) {
  if (SUPPORTED_LOCALES.includes(locale)) localStorage.setItem("pulse_locale", locale);
}
