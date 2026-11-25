import i18n from "@/i18n";
import { isSupportedPublicLocale } from "@/lib/publicLocale";

function hasExplicitLanguagePreference() {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem("pulse-language");
  if (isSupportedPublicLocale(stored)) return true;

  const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return firstPathSegment === "en" || firstPathSegment === "sq";
}

/**
 * Zgjedh gjuhën sipas vizitorit, pa thirrje në server (funksioni visitor-locale
 * nuk është i publikuar sepse projekti ka arritur kufirin e funksioneve).
 * Shqip kur shfletuesi është në shqip ose zona kohore është Tirana; ndryshe anglisht.
 * Zgjedhja manuale fiton gjithmonë (localStorage ose /en|/sq në adresë).
 */
export async function applyVisitorIpLanguage() {
  if (hasExplicitLanguagePreference() || typeof window === "undefined") return;
  try {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => (l || "").toLowerCase());
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const locale = langs.some((l) => l.startsWith("sq")) || tz === "Europe/Tirane" ? "sq" : null;
    if (locale && i18n.language !== locale) await i18n.changeLanguage(locale);
  } catch {
    // Detektori i i18next mbetet rezerva e sigurt.
  }
}
