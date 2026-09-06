import { useState, useEffect } from "react";
import { useManualPayment } from "@/hooks/useManualPayment";
import type { ManualPaymentMethod, PaymentMethodConfig } from "@/hooks/useManualPayment";
import {
  type SupportedCurrency,
  getPaymentMethodPriority,
} from "@/lib/currency";
import { FeeDisclosure } from "@/components/FeeDisclosure";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { AlertCircle, Check, Copy, Landmark, Loader2 } from "lucide-react";

interface ManualPaymentFlowProps {
  planKey: string;
  planName: string;
  packageType: string;
  chargedCurrency: SupportedCurrency;
  chargedAmount: number;
  workspaceId?: string;
  onSuccess?: (referenceId: string) => void;
}

const METHOD_META: Record<string, {
  label: string;
  icon: string;
  category: "bank" | "payoneer" | "courier";
}> = {
  bank_transfer_ALL:      { label: "Transfertë Bankare (ALL)",       icon: "🏦", category: "bank" },
  bank_transfer_EUR:      { label: "Bank Transfer / SEPA (EUR)",     icon: "🏦", category: "bank" },
  bank_transfer_USD:      { label: "Wire Transfer (USD)",            icon: "🏦", category: "bank" },
  payoneer_EUR:           { label: "Payoneer (EUR)",                 icon: "💳", category: "payoneer" },
  payoneer_USD:           { label: "Payoneer (USD)",                 icon: "💳", category: "payoneer" },
  cash_on_delivery_ALL:   { label: "Pagesë me korier (ALL)",         icon: "🚚", category: "courier" },
  cash_on_delivery_EUR:   { label: "Courier / cash on delivery (EUR)", icon: "🚚", category: "courier" },
  cash_on_delivery_USD:   { label: "Courier / cash on delivery (USD)", icon: "🚚", category: "courier" },
};

export function ManualPaymentFlow({
  planKey, planName, packageType,
  chargedCurrency, chargedAmount, workspaceId, onSuccess,
}: ManualPaymentFlowProps) {
  const { createPayment, submitConfirmation, getOptions, loading } = useManualPayment();

  const [availableMethods, setAvailableMethods] = useState<PaymentMethodConfig[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<ManualPaymentMethod | null>(null);
  const [step, setStep] = useState<"select" | "confirm" | "instructions" | "submitted">("select");
  const [paymentResult, setPaymentResult] = useState<{
    payment_id: string; reference_id: string; instructions: string;
  } | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [copied, setCopied] = useState(false);

  // Load available methods filtered and ordered by currency
  useEffect(() => {
    setOptionsLoading(true);
    setOptionsError(null);
    getOptions(chargedCurrency).then(({ available }) => {
      // Priority order for this currency
      const priority = getPaymentMethodPriority(chargedCurrency);
      // Filter to methods that match this currency (or are universal like payoneer)
      const filtered = available.filter(m =>
        m.currency === chargedCurrency ||
        m.method_type.startsWith("payoneer") // Payoneer accepts multiple currencies
      );
      // Sort by priority
      const sorted = [...filtered].sort((a, b) => {
        const ai = priority.indexOf(a.method_type);
        const bi = priority.indexOf(b.method_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setAvailableMethods(sorted);
      if (sorted.length > 0) setSelectedMethod(sorted[0].method_type as ManualPaymentMethod);
    }).catch((error: unknown) => {
      setOptionsError(error instanceof Error ? error.message : "Could not load payment methods");
    }).finally(() => setOptionsLoading(false));
  }, [chargedCurrency]);

  const selectedConfig = availableMethods.find(m => m.method_type === selectedMethod);
  // Receiving currency: same as method currency for bank transfers
  const receivingCurrency = selectedConfig
    ? (selectedConfig.currency as SupportedCurrency)
    : null;

  const handleCreate = async () => {
    if (!selectedMethod) return;
    try {
      const result = await createPayment({
        plan_key: planKey, package_type: packageType,
        payment_method: selectedMethod,
        charged_currency: chargedCurrency,
        charged_amount: chargedAmount,
        workspace_id: workspaceId,
        customer_note: customerNote || undefined,
      });
      setPaymentResult({
        payment_id: result.payment_id,
        reference_id: result.reference_id,
        instructions: result.instructions,
      });
      setStep("instructions");
    } catch (e: any) {
      toast.error(e.message || "Could not create payment");
    }
  };

  const handleSubmit = async () => {
    if (!paymentResult) return;
    try {
      await submitConfirmation(paymentResult.payment_id);
      setStep("submitted");
      onSuccess?.(paymentResult.reference_id);
    } catch (e: any) {
      toast.error(e.message || "Error submitting confirmation");
    }
  };

  const copyRef = () => {
    navigator.clipboard.writeText(paymentResult?.reference_id ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // No methods available for this currency
  const noAvailableMethod = !optionsLoading && !optionsError && availableMethods.length === 0;
  const selectedMethodMeta = selectedMethod ? METHOD_META[selectedMethod] : null;
  const hasCourierOption = availableMethods.some((method) => method.method_type.startsWith("cash_on_delivery"));

  if (step === "submitted") {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20">
        <CardContent className="py-8 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <CardTitle className="text-emerald-700 dark:text-emerald-400">Payment Submitted</CardTitle>
          <CardDescription>
            Reference: <span className="font-mono font-bold text-foreground">{paymentResult?.reference_id}</span>
            <br />Your subscription will activate within 1 business day after verification.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (step === "instructions" && paymentResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" /> Payment Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Reference ID */}
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
              Payment Reference — include in transfer
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xl font-bold tracking-wider text-primary">
                {paymentResult.reference_id}
              </span>
              <Button variant="outline" size="sm" onClick={copyRef}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ This reference must appear in your transfer description / memo field.
            </p>
          </div>

          {/* Admin-configured instructions (from payment_method_config) */}
          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-line">
            {paymentResult.instructions}
          </div>

          {/* Fee disclosure */}
          <FeeDisclosure
            planName={planName}
            planPrice={chargedAmount}
            chargedCurrency={chargedCurrency}
            paymentMethod={selectedMethod ?? ""}
            receivingCurrency={receivingCurrency ?? undefined}
            isProviderHandled={false}
            compact
          />

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Check className="mr-2 h-4 w-4" />}
            I Have Paid — Submit for Verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  // step === "select"
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasCourierOption ? "Bank Transfer / Payoneer / Courier" : "Bank Transfer / Payoneer"}</CardTitle>
        <CardDescription>
          Zero Pulse AI fees — direct payment in {chargedCurrency}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {optionsLoading ? (
          <div className="space-y-2">
            {[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : optionsError ? (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>Payment methods could not be loaded. Please try again.</p>
          </div>
        ) : noAvailableMethod ? (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              No verified manual payment method is configured for <strong>{chargedCurrency}</strong>.
              An administrator must enable a bank transfer, Payoneer, or courier/COD option
              with real receiving details before it can be used. PayPal remains separate where supported.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {availableMethods.map((m) => {
              const meta = METHOD_META[m.method_type];
              if (!meta) return null;
              const isSelected = selectedMethod === m.method_type;
              const showConversionHint = m.currency !== chargedCurrency;
              return (
                <button key={m.method_type} onClick={() => setSelectedMethod(m.method_type as ManualPaymentMethod)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors
                    ${isSelected ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{m.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {meta.category === "bank"
                        ? "No commission from Pulse AI"
                        : meta.category === "courier"
                          ? "Cash on delivery — courier terms apply"
                          : "Provider fees may apply"}
                      {showConversionHint && " · Conversion may apply"}
                    </p>
                  </div>
                  {isSelected && <Badge variant="default" className="text-xs">Selected</Badge>}
                </button>
              );
            })}
          </div>
        )}

        {!noBankAccount && selectedMethod && (
          <>
            <Textarea
              placeholder="Optional: your name or business name for the transfer"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              rows={2} className="text-sm"
            />

            {/* Pre-confirmation fee disclosure */}
            <FeeDisclosure
              planName={planName}
              planPrice={chargedAmount}
              chargedCurrency={chargedCurrency}
              paymentMethod={selectedMethod}
              receivingCurrency={receivingCurrency ?? undefined}
              isProviderHandled={false}
            />

            <Button className="w-full" onClick={handleCreate}
              disabled={loading}>
              {loading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Landmark className="mr-2 h-4 w-4" />}
              {selectedMethodMeta?.category === "courier"
                ? "Continue with courier"
                : selectedMethodMeta?.category === "payoneer"
                  ? "Get Payoneer instructions & reference ID"
                  : "Get bank details & reference ID"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
