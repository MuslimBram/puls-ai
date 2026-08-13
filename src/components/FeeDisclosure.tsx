import { AlertCircle, Info } from "lucide-react";
import { FEE_DISCLOSURE_TEXT, type SupportedCurrency } from "@/lib/currency";
import { formatCurrency } from "@/lib/currency";

interface FeeDisclosureProps {
  planName: string;
  planPrice: number;                        // amount in chargedCurrency
  chargedCurrency: SupportedCurrency;
  paymentMethod: string;                    // display label
  receivingCurrency?: SupportedCurrency;    // null if PayPal/Payoneer (provider handles)
  isProviderHandled?: boolean;              // true for PayPal/Payoneer — provider handles FX
  compact?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer_ALL: "Bank Transfer (ALL)",
  bank_transfer_EUR: "Bank Transfer / SEPA (EUR)",
  bank_transfer_USD: "Wire Transfer (USD)",
  payoneer_EUR:      "Payoneer (EUR)",
  payoneer_USD:      "Payoneer (USD)",
  paypal:            "PayPal",
  wallet:            "Wallet",
};

/**
 * FeeDisclosure — shown before payment confirmation.
 * Displays plan price, currency, method, and fee/conversion warnings.
 * Never shows hardcoded fee percentages (provider rates vary).
 */
export function FeeDisclosure({
  planName, planPrice, chargedCurrency, paymentMethod,
  receivingCurrency, isProviderHandled = false, compact = false,
}: FeeDisclosureProps) {
  const showConversionWarning =
    !isProviderHandled &&
    receivingCurrency != null &&
    chargedCurrency !== receivingCurrency;

  const methodLabel = METHOD_LABELS[paymentMethod] ?? paymentMethod;

  return (
    <div className={`space-y-3 rounded-lg border bg-muted/40 p-4 text-sm ${compact ? "text-xs" : ""}`}>
      {/* Summary table */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">{planName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Payment currency</span>
          <span className="font-medium">{chargedCurrency}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Payment method</span>
          <span className="font-medium">{methodLabel}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5">
          <span className="text-muted-foreground">Amount Pulse AI expects</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(planPrice, chargedCurrency)}
          </span>
        </div>
      </div>

      {/* Always-on disclosure */}
      <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="leading-snug">{FEE_DISCLOSURE_TEXT}</p>
      </div>

      {/* Provider fee note — always shown for provider-handled methods */}
      {isProviderHandled && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Provider/bank fees may apply
        </p>
      )}

      {/* Conversion warning — only when currencies don't match */}
      {showConversionWarning && (
        <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-2.5 text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="leading-snug">
            <strong>Currency conversion may apply.</strong>{" "}
            You are paying in <strong>{chargedCurrency}</strong>, but the receiving account is in{" "}
            <strong>{receivingCurrency}</strong>. Your bank may charge a conversion fee.
            To avoid this, use a method that matches your payment currency.
          </p>
        </div>
      )}

      {/* No bank account for this currency */}
      {!isProviderHandled && receivingCurrency == null && (
        <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-2.5 text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="leading-snug">
            A direct bank account in <strong>{chargedCurrency}</strong> is not yet configured.
            For a direct same-currency transfer, use PayPal or Payoneer.
          </p>
        </div>
      )}
    </div>
  );
}
