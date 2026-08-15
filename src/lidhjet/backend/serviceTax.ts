/**
 * PULSE AI — LIDHJET NATIVE MODULE
 * SERVICE TAX CALCULATION & WALLET DEBIT SIMULATOR
 */

import { ServiceTaxResult } from "./types";

export interface WalletState {
  id: string;
  user_id: string;
  currency: string;
  current_balance: number;
}

export interface InterestState {
  id: string;
  post_id: string;
  seller_user_id: string;
  buyer_user_id: string;
  status: string;
  tax_paid: boolean;
  expires_at: string;
}

export function processServiceTaxPayment(
  interest: InterestState,
  callerUserId: string,
  wallet: WalletState | null,
  lekPerEur: number | null,
  taxLek: number = 200
): ServiceTaxResult {
  // 1. Verify seller
  if (interest.seller_user_id !== callerUserId) {
    return { success: false, code: "unauthorized_seller_only", message: "Only post seller can pay service tax" };
  }

  // 2. Verify tax_paid state
  if (interest.tax_paid || interest.status === "tax_paid") {
    return { success: false, code: "alreadyPaid", message: "Service tax already paid" };
  }

  // 3. Verify expiry
  if (new Date(interest.expires_at) < new Date()) {
    return { success: false, code: "expired", message: "Interest has expired" };
  }

  // 4. Verify FX rate
  if (lekPerEur === null || lekPerEur === undefined || lekPerEur <= 0) {
    return { success: false, code: "fx_not_configured", message: "FX rate lek_per_eur is not configured" };
  }

  // 5. Calculate EUR tax
  const taxEur = Math.ceil(taxLek / lekPerEur);

  // 6. Verify Wallet balance
  if (!wallet || wallet.current_balance < taxEur) {
    return { success: false, code: "insufficient_funds", message: "Insufficient EUR wallet balance" };
  }

  // Perform debit
  wallet.current_balance -= taxEur;
  interest.tax_paid = true;
  interest.status = "tax_paid";

  return {
    success: true,
    code: "paid",
    tax_eur: taxEur,
    tax_lek: taxLek,
    lek_per_eur_used: lekPerEur,
  };
}
