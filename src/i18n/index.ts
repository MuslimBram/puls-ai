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

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "sq", label: "Shqip", flag: "🇦🇱" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "ro", label: "Română", flag: "🇷🇴" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "sr", label: "Srpski", flag: "🇷🇸" },
  { code: "mk", label: "Македонски", flag: "🇲🇰" },
  { code: "bg", label: "Български", flag: "🇧🇬" },
  { code: "hr", label: "Hrvatski", flag: "🇭🇷" },
  { code: "sl", label: "Slovenščina", flag: "🇸🇮" },
  { code: "bs", label: "Bosanski", flag: "🇧🇦" },
  { code: "me", label: "Crnogorski", flag: "🇲🇪" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "da", label: "Dansk", flag: "🇩🇰" },
  { code: "fi", label: "Suomi", flag: "🇫🇮" },
  { code: "no", label: "Norsk", flag: "🇳🇴" },
] as const;
