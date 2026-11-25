/**
 * Monedha që vizitori zgjedh për të parë çmimet (Lek / Euro / Dollar).
 * Ruhet në localStorage ("pulse-currency") dhe ndahet mes të gjitha faqeve.
 * Vetëm për shfaqje: pagesa reale vendoset te faqja e pagesës.
 */
import { useSyncExternalStore } from "react";
import { formatCurrency, previewFromEUR, STATIC_FX_PREVIEW, type SupportedCurrency } from "@/lib/currency";

const KEY = "pulse-currency";
export const DISPLAY_CURRENCIES: { code: SupportedCurrency; label: string; flag: string }[] = [
  { code: "ALL", label: "Lek", flag: "🇦🇱" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "USD", label: "Dollar", flag: "🇺🇸" },
];

function guess(): SupportedCurrency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const lang = (navigator.language || "").toLowerCase();
    if (tz === "Europe/Tirane" || lang.startsWith("sq")) return "ALL";
    if (tz.startsWith("America/")) return "USD";
  } catch { /* ignore */ }
  return "EUR";
}

function read(): SupportedCurrency {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ALL" || v === "EUR" || v === "USD") return v;
  } catch { /* ignore */ }
  return guess();
}

const listeners = new Set<() => void>();
let current: SupportedCurrency | null = null;

export function setDisplayCurrency(c: SupportedCurrency) {
  current = c;
  try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => (current ??= read());

export type ExactPrices = Partial<Record<SupportedCurrency, number | null | undefined>>;

export function useDisplayCurrency() {
  const currency = useSyncExternalStore(subscribe, snapshot, () => "ALL" as SupportedCurrency);

  /** Shuma bazë në Lek → monedha e zgjedhur. Përdor çmimin e saktë nëse ekziston, ndryshe kurs orientues (≈). */
  const fromALL = (amountALL: number | null | undefined, exact?: ExactPrices): string => {
    const all = typeof amountALL === "number" && Number.isFinite(amountALL) ? amountALL : 0;
    if (currency === "ALL") return formatCurrency(all, "ALL");
    const ex = exact?.[currency];
    if (typeof ex === "number" && Number.isFinite(ex)) return formatCurrency(ex, currency);
    const converted = previewFromEUR(all / STATIC_FX_PREVIEW.ALL, currency);
    return "≈ " + formatCurrency(Math.round(converted), currency);
  };

  /** Shuma në një monedhë bazë (EUR/USD/ALL) → monedha e zgjedhur; e saktë kur monedhat përputhen, ndryshe ≈. */
  const fromBase = (amount: number | null | undefined, base: SupportedCurrency): string => {
    const v = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
    if (base === currency) return formatCurrency(v, currency);
    const eur = v / STATIC_FX_PREVIEW[base];
    const out = currency === "EUR" ? eur : previewFromEUR(eur, currency);
    return "≈ " + formatCurrency(currency === "ALL" ? Math.round(out / 100) * 100 : Math.round(out), currency);
  };

  return { currency, setCurrency: setDisplayCurrency, fromALL, fromBase, isIndicative: currency !== "ALL" };
}
