import i18n from "@/i18n";
import { isSupportedPublicLocale } from "@/lib/publicLocale";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");

function hasExplicitLanguagePreference() {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem("pulse-language");
  if (isSupportedPublicLocale(stored)) return true;

  const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return firstPathSegment === "en" || firstPathSegment === "sq";
}

/**
 * Select a functional language from the visitor's IP-derived country.
 * Manual language selection always wins via localStorage or an explicit /en|/sq URL.
 */
export async function applyVisitorIpLanguage() {
  if (hasExplicitLanguagePreference() || !SUPABASE_URL) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/visitor-locale`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!response.ok) return;

    const data = (await response.json()) as { locale?: string };
    if (data.locale === "en" || data.locale === "sq") {
      await i18n.changeLanguage(data.locale);
    }
  } catch {
    // Existing i18next detector remains the safe fallback.
  }
}
