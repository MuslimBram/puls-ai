/**
 * Telephony providers a business (or a Pulse AI admin) can choose from,
 * with public prices and what each one is best at.
 *
 * Prices: public list prices in USD, checked November 2026. They change
 * often and differ per account, so the UI always labels them as indicative
 * and links to the provider's own price page. `source` says how reliable
 * each figure is.
 */
import { PROVIDER_CAPABILITIES, type ProviderId } from "../../supabase/functions/_shared/telephony/providers";

export type PriceSource = "official" | "third_party" | "not_published";

export interface PriceLine {
  label: { sq: string; en: string };
  usd: number | null;
  unit: "min" | "month" | "sms";
  source: PriceSource;
}

export interface TelephonyProviderInfo {
  id: ProviderId;
  label: string;
  dashboardUrl: string;
  pricingUrl: string;
  prices: PriceLine[];
  bestFor: { sq: string; en: string };
  pros: { sq: string[]; en: string[] };
  cons: { sq: string[]; en: string[] };
}

const L = (sq: string, en: string) => ({ sq, en });

export const TELEPHONY_PROVIDERS: TelephonyProviderInfo[] = [
  {
    id: "twilio",
    label: "Twilio",
    dashboardUrl: "https://console.twilio.com/",
    pricingUrl: "https://www.twilio.com/en-us/voice/pricing/al",
    prices: [
      { label: L("Thirrje dalëse → fiks Shqipëri", "Outbound → Albania landline"), usd: 0.295, unit: "min", source: "official" },
      { label: L("Thirrje dalëse → celular Shqipëri", "Outbound → Albania mobile"), usd: 0.7265, unit: "min", source: "official" },
      { label: L("Marrje në shfletues (softphone)", "Receive in browser (softphone)"), usd: 0.004, unit: "min", source: "official" },
      { label: L("AI me zë (ConversationRelay)", "AI voice (ConversationRelay)"), usd: 0.07, unit: "min", source: "official" },
      { label: L("Numër SHBA", "US number"), usd: 1.15, unit: "month", source: "official" },
    ],
    bestFor: L("Softphone në shfletues dhe recepsionist AI me zë.", "Browser softphone and the AI voice receptionist."),
    pros: {
      sq: ["I vetmi me softphone në shfletues në Pulse AI", "I vetmi me recepsionist AI me zë", "Dokumentim dhe stabilitet shumë i mirë"],
      en: ["Only provider with the in-browser softphone in Pulse AI", "Only provider with the AI voice receptionist", "Excellent documentation and reliability"],
    },
    cons: {
      sq: ["Shumë i shtrenjtë për thirrje drejt celularëve shqiptarë", "Nuk ka zë shqip të verifikuar (përdorni audio të regjistruar)"],
      en: ["Very expensive for calls to Albanian mobiles", "No verified Albanian voice (use recorded audio)"],
    },
  },
  {
    id: "telnyx",
    label: "Telnyx",
    dashboardUrl: "https://portal.telnyx.com/",
    pricingUrl: "https://telnyx.com/pricing/call-control",
    prices: [
      { label: L("Thirrje dalëse SHBA", "Outbound US"), usd: 0.007, unit: "min", source: "third_party" },
      { label: L("Thirrje hyrëse SHBA", "Inbound US"), usd: 0.0052, unit: "min", source: "third_party" },
      { label: L("Numër SHBA (nga)", "US number (from)"), usd: 1, unit: "month", source: "third_party" },
      { label: L("Thirrje drejt Shqipërisë", "Calls to Albania"), usd: null, unit: "min", source: "not_published" },
    ],
    bestFor: L("Biznese që duan IVR që flet shqip dhe çmime të ulëta.", "Businesses that want an IVR that speaks Albanian, at low prices."),
    pros: {
      sq: ["Zë shqip natyral (Azure sq-AL Anila / Ilir)", "Ndër çmimet më të ulëta për minutë", "Mund të lidhë trunk-un SIP të operatorit vendas"],
      en: ["Natural Albanian voice (Azure sq-AL Anila / Ilir)", "Among the lowest per-minute prices", "Can carry a local operator's SIP trunk"],
    },
    cons: {
      sq: ["Pa softphone në shfletues në Pulse AI (agjentët marrin në SIP ose telefon)", "Pa recepsionist AI me zë ende"],
      en: ["No in-browser softphone in Pulse AI (agents answer on SIP or phone)", "No AI voice receptionist yet"],
    },
  },
  {
    id: "plivo",
    label: "Plivo",
    dashboardUrl: "https://console.plivo.com/",
    pricingUrl: "https://www.plivo.com/voice/pricing/",
    prices: [
      { label: L("Thirrje dalëse SHBA", "Outbound US"), usd: 0.0115, unit: "min", source: "third_party" },
      { label: L("Thirrje hyrëse SHBA", "Inbound US"), usd: 0.0055, unit: "min", source: "third_party" },
      { label: L("Numër SHBA", "US number"), usd: 0.5, unit: "month", source: "third_party" },
      { label: L("SMS → Shqipëri", "SMS → Albania"), usd: 0.1021, unit: "sms", source: "official" },
    ],
    bestFor: L("Numra të lirë dhe SMS me çmim të publikuar për Shqipërinë.", "Cheap numbers and SMS with a published price for Albania."),
    pros: {
      sq: ["Numrat më të lirë", "Çmim SMS i publikuar për Shqipërinë", "API e thjeshtë"],
      en: ["Cheapest numbers", "Published SMS price for Albania", "Simple API"],
    },
    cons: {
      sq: ["Zë shqip i paverifikuar", "Pa softphone në shfletues në Pulse AI"],
      en: ["Albanian voice not verified", "No in-browser softphone in Pulse AI"],
    },
  },
  {
    id: "vonage",
    label: "Vonage",
    dashboardUrl: "https://dashboard.nexmo.com/",
    pricingUrl: "https://www.vonage.com/communications-apis/voice/pricing/",
    prices: [
      { label: L("Thirrje hyrëse SHBA", "Inbound US"), usd: 0.0049, unit: "min", source: "third_party" },
      { label: L("Thirrje dalëse SHBA", "Outbound US"), usd: 0.0145, unit: "min", source: "third_party" },
      { label: L("Thirrje drejt Shqipërisë", "Calls to Albania"), usd: null, unit: "min", source: "not_published" },
    ],
    bestFor: L("Kompani që përdorin tashmë Vonage për komunikime.", "Companies that already use Vonage for communications."),
    pros: {
      sq: ["Ofrues i madh global", "Webhook-e të nënshkruara (JWT)"],
      en: ["Large global provider", "Signed webhooks (JWT)"],
    },
    cons: {
      sq: ["Konfigurim më i gjatë (aplikacion + çelës privat)", "Çmimet ndryshojnë sipas burimit", "Zë shqip i paverifikuar"],
      en: ["Longer setup (application + private key)", "Prices differ between sources", "Albanian voice not verified"],
    },
  },
  {
    id: "custom_sip",
    label: "Custom SIP (operator vendas / own operator)",
    dashboardUrl: "",
    pricingUrl: "",
    prices: [
      { label: L("Minutat e operatorit tuaj (ofertë)", "Your operator's minutes (quote)"), usd: null, unit: "min", source: "not_published" },
      { label: L("+ minutat SIP të urës (Telnyx/Twilio)", "+ bridge SIP minutes (Telnyx/Twilio)"), usd: null, unit: "min", source: "not_published" },
    ],
    bestFor: L("Numër shqiptar dhe thirrje lokale me çmimin e operatorit vendas.", "An Albanian number and local calls at your local operator's price."),
    pros: {
      sq: ["Numër shqiptar (+355)", "Thirrjet lokale me tarifat e operatorit tuaj", "Ruani numrin ekzistues"],
      en: ["Albanian (+355) number", "Local calls at your operator's rates", "Keep your existing number"],
    },
    cons: {
      sq: ["Kërkon trunk SIP nga operatori", "Kalon përmes Telnyx ose Twilio (ura)", "Konfigurim teknik"],
      en: ["Needs a SIP trunk from the operator", "Runs through Telnyx or Twilio (bridge)", "Technical setup"],
    },
  },
];

export const capabilitiesOf = (id: ProviderId) => PROVIDER_CAPABILITIES[id];

/** Rule-of-thumb recommendation for the setup screen. */
export function recommendProvider(needs: { albanianVoice?: boolean; browserSoftphone?: boolean; aiVoice?: boolean; albanianNumber?: boolean }): ProviderId {
  if (needs.browserSoftphone || needs.aiVoice) return "twilio";
  if (needs.albanianNumber) return "custom_sip";
  if (needs.albanianVoice) return "telnyx";
  return "telnyx";
}
