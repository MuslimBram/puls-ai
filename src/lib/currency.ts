/**
 * Multi-currency support for Pulse AI.
 * Base/canonical accounting currency: EUR.
 * Supported payment currencies: EUR, USD, ALL.
 *
 * IMPORTANT: STATIC_FX_TO_EUR is for DISPLAY/PREVIEW only.
 * It is never used for actual settlement amounts or subscription pricing.
 * Explicit price matrix (pricing_settings.monthly_price_eur/usd/all) is
 * always preferred for real transactions. If not configured, show
 * "amount indicative — bank/provider fees may apply".
 */

export type SupportedCurrency = "EUR" | "USD" | "ALL";

export const BASE_CURRENCY: SupportedCurrency = "EUR";

/** @deprecated Use formatCurrency(value, "ALL") */
export const CURRENCY_CODE = "ALL";
/** @deprecated */
export const CURRENCY_LABEL = "ALL";

const nf = (decimals: number, locale = "en-US") =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const CURRENCY_CONFIG: Record<SupportedCurrency, { decimals: number; symbol: string; locale: string }> = {
  EUR: { decimals: 2, symbol: "€",  locale: "de-DE" },
  USD: { decimals: 2, symbol: "$",  locale: "en-US" },
  ALL: { decimals: 0, symbol: "L",  locale: "sq-AL" },
};

export const formatCurrency = (
  value: number | null | undefined,
  currency: SupportedCurrency = "EUR",
): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const cfg = CURRENCY_CONFIG[currency];
  const formatted = nf(cfg.decimals, cfg.locale).format(amount);
  if (currency === "ALL") return `${formatted} ALL`;
  return `${cfg.symbol}${formatted}`;
};

/** @deprecated Use formatCurrency(value, "ALL") */
export const formatALL = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${nf(decimals).format(amount)} ALL`;
};

export const formatALLNumber = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return nf(decimals).format(amount);
};

/**
 * PREVIEW-ONLY static FX rates (not for settlement).
 * Used only to show indicative prices when an explicit price is not configured.
 * Always show "indicative price — provider fees may apply" when using these.
 */
export const STATIC_FX_PREVIEW: Record<SupportedCurrency, number> = {
  EUR: 1.0,
  USD: 1.08,   // 1 EUR ≈ 1.08 USD  (informational only)
  ALL: 103.5,  // 1 EUR ≈ 103.5 ALL (informational only)
};

/**
 * @preview-only Convert EUR amount to display currency (indicative).
 * Do NOT use for settlement or invoice amounts.
 */
export const previewFromEUR = (eurAmount: number, targetCurrency: SupportedCurrency): number => {
  if (targetCurrency === "EUR") return eurAmount;
  return Math.round(eurAmount * STATIC_FX_PREVIEW[targetCurrency] * 100) / 100;
};

/**
 * @preview-only Estimate EUR equivalent (indicative, not for settlement).
 */
export const previewToEUR = (amount: number, fromCurrency: SupportedCurrency): number => {
  if (fromCurrency === "EUR") return amount;
  return Math.round((amount / STATIC_FX_PREVIEW[fromCurrency]) * 100) / 100;
};

/** EU/SEPA country codes that default to EUR */
const SEPA_EUR_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR",
  "GB","GR","HR","HU","IE","IT","LT","LU","LV","ME","MK",
  "MT","NL","NO","PL","PT","RO","RS","SE","SI","SK","CH","XK",
]);

/**
 * Determine the default payment currency for a given ISO 3166-1 alpha-2 country code.
 * Returns the currency and whether the selection was explicit (not a fallback).
 */
export const getCurrencyForCountry = (
  countryCode: string | null | undefined,
): { currency: SupportedCurrency; explicit: boolean } => {
  if (!countryCode) return { currency: "EUR", explicit: false };
  const code = countryCode.toUpperCase();
  if (code === "AL") return { currency: "ALL", explicit: true };
  if (code === "US" || code === "CA") return { currency: "USD", explicit: true };
  if (SEPA_EUR_COUNTRIES.has(code)) return { currency: "EUR", explicit: true };
  return { currency: "EUR", explicit: false }; // fallback — user can change
};

/**
 * Priority-ordered payment methods for a given currency.
 * Priority: BANK_TRANSFER → PAYONEER → PAYPAL → STRIPE(disabled)
 */
export const getPaymentMethodPriority = (currency: SupportedCurrency): string[] => {
  switch (currency) {
    case "ALL": return ["bank_transfer_ALL", "cash_on_delivery_ALL", "payoneer_EUR", "paypal"];
    case "EUR": return ["bank_transfer_EUR", "cash_on_delivery_EUR", "payoneer_EUR", "paypal"];
    case "USD": return ["bank_transfer_USD", "cash_on_delivery_USD", "payoneer_USD", "paypal"];
    default:    return ["paypal", "bank_transfer_EUR", "cash_on_delivery_EUR", "payoneer_EUR"];
  }
};

/**
 * Fee & conversion disclosure text (static, always shown).
 */
export const FEE_DISCLOSURE_TEXT =
  "Pulse AI does not add hidden currency-conversion fees. " +
  "Your bank or payment provider may charge transfer, receiving, or currency-conversion fees. " +
  "For lower costs, use a payment method/account in the same currency as your payment.";

/**
 * Whether a conversion warning should be shown.
 * True when the customer's payment currency ≠ the receiving account currency.
 */
export const needsConversionWarning = (
  chargedCurrency: SupportedCurrency,
  receivingCurrency: SupportedCurrency | null | undefined,
): boolean => {
  if (!receivingCurrency) return false;
  return chargedCurrency !== receivingCurrency;
};
