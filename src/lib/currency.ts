/**
 * Multi-currency support for Pulse AI.
 * Base/canonical currency: EUR.
 * Supported payment currencies: EUR, USD, ALL.
 * Prices stored in EUR; ALL used for Albanian market display.
 */

export type SupportedCurrency = "EUR" | "USD" | "ALL";

export const BASE_CURRENCY: SupportedCurrency = "EUR";

/** @deprecated Use formatCurrency(value, "ALL") — kept for backward compat */
export const CURRENCY_CODE = "ALL";
/** @deprecated */
export const CURRENCY_LABEL = "ALL";

const nf = (decimals: number, locale = "en-US") =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const CURRENCY_CONFIG: Record<SupportedCurrency, { decimals: number; symbol: string; locale: string }> = {
  EUR: { decimals: 2, symbol: "€", locale: "de-DE" },
  USD: { decimals: 2, symbol: "$", locale: "en-US" },
  ALL: { decimals: 0, symbol: "L", locale: "sq-AL" },
};

/**
 * Format a numeric amount in the specified currency.
 * e.g. formatCurrency(99, "EUR") => "€99.00"
 *      formatCurrency(9900, "ALL") => "9,900 ALL"
 */
export const formatCurrency = (
  value: number | null | undefined,
  currency: SupportedCurrency = "EUR",
): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const cfg = CURRENCY_CONFIG[currency];
  const formatted = nf(cfg.decimals, cfg.locale).format(amount);
  // ALL uses suffix; EUR/USD use prefix symbol
  if (currency === "ALL") return `${formatted} ALL`;
  return `${cfg.symbol}${formatted}`;
};

/**
 * @deprecated Use formatCurrency(value, "ALL")
 */
export const formatALL = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${nf(decimals).format(amount)} ALL`;
};

/** Compact number without currency suffix */
export const formatALLNumber = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return nf(decimals).format(amount);
};

/** Static FX rates relative to EUR — update periodically or integrate live feed */
export const STATIC_FX_TO_EUR: Record<SupportedCurrency, number> = {
  EUR: 1.0,
  USD: 1.08,   // 1 EUR ≈ 1.08 USD
  ALL: 103.5,  // 1 EUR ≈ 103.5 ALL
};

/**
 * Convert an amount in fromCurrency to EUR.
 */
export const toEUR = (amount: number, fromCurrency: SupportedCurrency): number => {
  if (fromCurrency === "EUR") return amount;
  return Math.round((amount / STATIC_FX_TO_EUR[fromCurrency]) * 100) / 100;
};

/**
 * Convert an amount from EUR to targetCurrency.
 */
export const fromEUR = (eurAmount: number, targetCurrency: SupportedCurrency): number => {
  if (targetCurrency === "EUR") return eurAmount;
  return Math.round(eurAmount * STATIC_FX_TO_EUR[targetCurrency] * 100) / 100;
};

/**
 * Recommend payment method order based on customer currency/country.
 * Priority: BANK_TRANSFER → PAYONEER → PAYPAL
 */
export const recommendPaymentMethods = (
  currency: SupportedCurrency,
  country?: string,
): string[] => {
  if (currency === "ALL" || country === "AL") {
    return ["bank_transfer_ALL", "payoneer_EUR", "paypal"];
  }
  if (currency === "EUR") {
    return ["bank_transfer_EUR", "payoneer_EUR", "paypal"];
  }
  if (currency === "USD") {
    return ["bank_transfer_USD", "payoneer_USD", "paypal"];
  }
  return ["paypal", "payoneer_EUR", "bank_transfer_EUR"];
};
