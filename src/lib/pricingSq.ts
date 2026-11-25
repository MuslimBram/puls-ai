/**
 * Përkthimi shqip i teksteve të paketave që vijnë nga databaza (pricing_settings,
 * pricing_feature_sections, pricing_feature_rows). Kur gjuha është anglisht,
 * përdoret teksti origjinal i databazës.
 */
const SQ: Record<string, string> = {
  // përshkrimet e paketave
  "Essential tools to get started with customer engagement": "Mjetet bazë për të nisur komunikimin me klientët",
  "Scale your outreach with advanced AI and multi-channel support": "Rritni shtrirjen me AI të avancuar dhe shumë kanale",
  "Full-featured platform for growing businesses": "Platformë e plotë për bizneset në rritje",
  "Unlimited power for large-scale operations": "Fuqi pa kufi për operacione të mëdha",
  "Support Pulse AI development": "Mbështetni zhvillimin e Pulse AI",
  // butonat dhe etiketat
  "Start Free Trial": "Fillo provën falas",
  "Contact Sales": "Kërko ofertë",
  "Donate": "Dhuro",
  "Most Popular": "Më e zgjedhura",
  "Full Power": "Fuqi e plotë",
  "Support Us": "Na mbështetni",
  "Support": "Mbështetje",
  "Choose plan": "Zgjidh paketën",
  // seksionet e krahasimit
  "Publishing & content": "Publikimi & përmbajtja",
  "Inbox & conversations": "Inbox & bisedat",
  "Automation": "Automatizimi",
  "Analytics & reporting": "Analitika & raportet",
  "Integrations & API": "Integrimet & API",
  "Security & governance": "Siguria & qeverisja",
  // veçoritë
  "Analytics": "Analitika",
  "Automation workflows": "Rrjedha automatizimi",
  "Content publishing": "Publikimi i përmbajtjes",
  "Core channel integrations": "Integrimet bazë të kanaleve",
  "Unified inbox": "Inbox i unifikuar",
  "Roles & permissions": "Rolet & lejet",
  "Advanced security": "Siguri e avancuar",
  "AI content generation": "Krijimi i përmbajtjes me AI",
  "Saved replies": "Përgjigje të ruajtura",
  "Automation rule builder": "Ndërtuesi i rregullave të automatizimit",
  "Deep analytics": "Analitikë e thellë",
  "Keyword monitoring": "Monitorimi i fjalëve kyçe",
  "Public API access": "Qasje në API publike",
  "Competitor reports": "Raporte për konkurrentët",
};

export function trPricing(text: string | null | undefined, lang: string | undefined): string {
  if (!text) return text ?? "";
  if (!lang?.startsWith("sq")) return text;
  return SQ[text] ?? text;
}
