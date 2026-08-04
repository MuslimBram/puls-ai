/**
 * Single source of truth for currency display across Pulse AI.
 * All prices, commissions and wallet balances are denominated in Albanian Lek (ALL).
 */

export const CURRENCY_CODE = "ALL";
export const CURRENCY_LABEL = "ALL";

const nf = (decimals: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Format a numeric amount as Albanian Lek, e.g. formatALL(9900) => "9,900 ALL".
 * Lek has no sub-unit in practice, so decimals default to 0.
 */
export const formatALL = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${nf(decimals).format(amount)} ${CURRENCY_LABEL}`;
};

/** Compact variant without the currency suffix, e.g. "9,900". */
export const formatALLNumber = (value: number | null | undefined, decimals = 0): string => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return nf(decimals).format(amount);
};
