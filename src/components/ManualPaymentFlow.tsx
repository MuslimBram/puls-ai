import { useState } from "react";
import { useManualPayment } from "@/hooks/useManualPayment";
import type { ManualPaymentMethod } from "@/hooks/useManualPayment";
import type { SupportedCurrency } from "@/lib/currency";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { Check, Copy, Landmark, Loader2, AlertCircle } from "lucide-react";

interface ManualPaymentFlowProps {
  planKey: string;
  packageType: string;
  chargedCurrency: SupportedCurrency;
  chargedAmount: number;
  workspaceId?: string;
  onSuccess?: (referenceId: string) => void;
}

const METHOD_LABELS: Record<string, { label: string; icon: string; category: "bank" | "payoneer" }> = {
  bank_transfer_ALL: { label: "Transfertë Bankare (ALL)", icon: "🏦", category: "bank" },
  bank_transfer_EUR: { label: "Bank Transfer / SEPA (EUR)", icon: "🏦", category: "bank" },
  bank_transfer_USD: { label: "Wire Transfer (USD)", icon: "🏦", category: "bank" },
  payoneer_EUR:      { label: "Payoneer (EUR)", icon: "💳", category: "payoneer" },
  payoneer_USD:      { label: "Payoneer (USD)", icon: "💳", category: "payoneer" },
};

export function ManualPaymentFlow({
  planKey, packageType, chargedCurrency, chargedAmount, workspaceId, onSuccess,
}: ManualPaymentFlowProps) {
  const { createPayment, submitConfirmation, loading } = useManualPayment();
  const [step, setStep] = useState<"select" | "instructions" | "submitted">("select");
  const [selectedMethod, setSelectedMethod] = useState<ManualPaymentMethod | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ payment_id: string; reference_id: string; instructions: string } | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [copied, setCopied] = useState(false);

  // Determine which methods make sense for this currency
  const methodOrder: ManualPaymentMethod[] =
    chargedCurrency === "ALL" ? ["bank_transfer_ALL", "payoneer_EUR"]
    : chargedCurrency === "EUR" ? ["bank_transfer_EUR", "payoneer_EUR"]
    : ["bank_transfer_USD", "payoneer_USD"];

  const handleCreate = async () => {
    if (!selectedMethod) return;
    try {
      const result = await createPayment({
        plan_key: planKey,
        package_type: packageType,
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
            <br />We will verify your payment and activate your subscription within 1 business day.
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
            <Landmark className="h-5 w-5" />
            Payment Instructions
          </CardTitle>
          <CardDescription>
            Amount: <strong>{formatCurrency(chargedAmount, chargedCurrency)}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Reference ID — most important */}
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">YOUR PAYMENT REFERENCE (include in transfer)</p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xl font-bold tracking-wider text-primary">
                {paymentResult.reference_id}
              </span>
              <Button variant="outline" size="sm" onClick={copyRef}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ This reference must appear in your transfer description or memo field.
            </p>
          </div>

          {/* Instructions from admin config */}
          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-line">
            {paymentResult.instructions}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>After completing your transfer, click &quot;I Have Paid&quot; below. Your subscription activates after admin verification (max 1 business day).</span>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            I Have Paid — Submit for Verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step: select method
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Payment</CardTitle>
        <CardDescription>
          Select your preferred payment method. Bank transfer has zero commission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {methodOrder.map((method) => {
            const meta = METHOD_LABELS[method];
            if (!meta) return null;
            const isSelected = selectedMethod === method;
            return (
              <button
                key={method}
                onClick={() => setSelectedMethod(method)}
                className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors
                  ${isSelected ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}
              >
                <span className="text-2xl">{meta.icon}</span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta.category === "bank" ? "No commission • 1-2 business days" : "Low commission • 1-2 business days"}
                  </p>
                </div>
                {isSelected && <Badge variant="default" className="text-xs">Selected</Badge>}
              </button>
            );
          })}
        </div>

        <Textarea
          placeholder="Optional: leave a note (e.g. your name or business name)"
          value={customerNote}
          onChange={(e) => setCustomerNote(e.target.value)}
          rows={2}
          className="text-sm"
        />

        <Button
          className="w-full"
          onClick={handleCreate}
          disabled={!selectedMethod || loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
          Get Payment Instructions
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Amount: {formatCurrency(chargedAmount, chargedCurrency)} •
          Subscription activates after verification
        </p>
      </CardContent>
    </Card>
  );
}
