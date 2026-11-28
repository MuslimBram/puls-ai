/**
 * _shared/voice-language.ts — pure, unit-tested.
 */
/**
 * Language + Albanian register for the AI's wording. The synthetic voice
 * itself speaks standard Albanian; the dialect setting changes vocabulary and
 * phrasing so callers from the North/Kosovo (Gheg) or the South (Tosk) feel
 * addressed naturally.
 */
export function languageInstruction(language: string, dialect: string): string {
  const lang = language.toLowerCase();
  if (!lang.startsWith("sq")) {
    return language ? `LANGUAGE: Reply in the caller's language; default to ${language}.` : "LANGUAGE: Reply in the caller's language.";
  }
  const base = "LANGUAGE: Reply in Albanian (shqip) unless the caller clearly speaks another language; then switch to it.";
  if (dialect === "gheg") {
    return `${base} Use a friendly Gheg register (North Albania / Kosovo): natural Gheg vocabulary and phrasing (e.g. "po" / "jo", "a ka mundësi", "qysh", "me ardhë" where it sounds natural), but stay clearly understandable and polite. Never mock or exaggerate the dialect.`;
  }
  if (dialect === "tosk") {
    return `${base} Use a natural Tosk register (South Albania): everyday southern vocabulary and phrasing, polite and clear.`;
  }
  return `${base} Use standard literary Albanian, polite and clear.`;
}

