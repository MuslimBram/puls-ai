import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en";
import sq from "./sq";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sq: { translation: sq },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "pulse-language",
    },
  });

export default i18n;

/**
 * Languages with real translation resources loaded by i18next.
 *
 * Keep this list aligned with `resources` above. Listing a language here without
 * a translation resource makes the UI claim support while silently falling back
 * to English, which is misleading.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "sq", label: "Shqip", flag: "🇦🇱" },
] as const;
