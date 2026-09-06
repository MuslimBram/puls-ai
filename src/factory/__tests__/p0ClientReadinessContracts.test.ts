import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("P0 client-readiness contracts", () => {
  it("keeps customer billing bound to subscription state", () => {
    const sources = [
      read("src/components/ProtectedRoute.tsx"),
      read("src/hooks/useSubscription.ts"),
      read("supabase/functions/check-subscription/index.ts"),
      read("supabase/functions/enforce-limits/index.ts"),
      read("supabase/functions/generate-reply/index.ts"),
      read("supabase/functions/dedicated-ai-reply/index.ts"),
      read("supabase/functions/generate-media/index.ts"),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/(?:privilegedBypass|hasPrivilegedBypass)\s*=\s*[^;\n]*business_owner/);
    }
    expect(read("supabase/functions/leah-session/index.ts")).toContain(
      'const ADMIN_ROLES = new Set(["admin", "super_admin"]);',
    );
  });

  it("uses server-owned Stripe prices and workspace metadata", () => {
    const source = read("supabase/functions/create-checkout/index.ts");
    expect(source).toContain("const catalogPriceId");
    expect(source).toContain("Checkout price must come from the server pricing catalog");
    expect(source).toContain("A workspace is required before starting plan checkout");
    expect(source).toContain("workspace_id: workspaceId");
    expect(source).toContain("if (trialDays) packageEndsAt.setDate");
    expect(source).not.toMatch(/\n\s*packageEndsAt\.setDate\(packageEndsAt\.getDate\(\) \+ trialDays\);/);
  });

  it("connects completed billing to the LEAH lifecycle", () => {
    const stripe = read("supabase/functions/stripe-webhook/index.ts");
    const paypal = read("supabase/functions/capture-paypal-order/index.ts");
    expect(stripe).toContain('supabase.rpc("leah_apply_billing_entitlement_event"');
    expect(stripe).toContain("providerEventId");
    expect(stripe).toContain("const lifecycleAction");
    expect(stripe).toContain("does not change LEAH entitlement");
    expect(stripe).toContain('status: "failed"');
    expect(paypal).toContain('payment_status: "paid"');
    expect(paypal).toContain('supabase.rpc("leah_apply_billing_entitlement_event"');
    const paypalWebhook = read("supabase/functions/paypal-webhook/index.ts");
    expect(paypalWebhook).toContain("PAYMENT.CAPTURE.REFUNDED");
    expect(paypalWebhook).toContain("PAYMENT.CAPTURE.REVERSED");
    expect(paypalWebhook).toContain('_action: "refund"');
    expect(paypalWebhook).toContain("PAYMENT.CAPTURE.DENIED");
  });

  it("pins PayPal order, capture, and webhook verification to one explicit environment", () => {
    const helper = read("supabase/functions/_shared/paypal-config.ts");
    expect(helper).toContain('raw !== "true" && raw !== "false"');
    expect(helper).toContain("PAYPAL_SANDBOX must be explicitly configured as true or false");

    for (const path of [
      "supabase/functions/create-paypal-order/index.ts",
      "supabase/functions/capture-paypal-order/index.ts",
      "supabase/functions/paypal-webhook/index.ts",
    ]) {
      expect(read(path)).toContain("getPayPalSandboxMode()");
    }
  });


  it("keeps the payment chooser connected to configured manual methods", () => {
    const completePayment = read("src/pages/CompletePayment.tsx");
    const manualPayment = read("src/components/ManualPaymentFlow.tsx");
    const currency = read("src/lib/currency.ts");

    expect(completePayment).toContain("<ManualPaymentFlow");
    expect(completePayment).toContain("Bank transfer · Payoneer · Courier / COD");
    expect(completePayment).toContain("Card (Stripe)");
    expect(completePayment).toContain("Not configured");
    expect(manualPayment).toContain("cash_on_delivery_ALL");
    expect(manualPayment).toContain("No verified manual payment method is configured");
    expect(currency).toContain("cash_on_delivery_ALL");
  });

  it("keeps subscription selection truthful and carries the chosen term into payment", () => {
    const subscription = read("src/pages/Subscription.tsx");
    const pricing = read("src/pages/Pricing.tsx");
    const duration = read("src/components/pricing/PricingDurationSelector.tsx");
    const payment = read("src/pages/CompletePayment.tsx");
    const adminPricing = read("src/components/AdminPricingManager.tsx");
    const adminRoleManager = read("src/components/AdminRoleManager.tsx");
    const workspaceTeamRoles = read("src/components/WorkspaceTeamRoles.tsx");

    expect(subscription).toContain("No charge · Admin access");
    expect(subscription).toContain("/complete-payment?plan=");
    expect(pricing).toContain("/complete-payment?plan=");
    expect(duration).toContain('direction="reverse"');
    expect(payment).toContain('searchParams.get("packageType")');
    expect(payment).toContain('["ALL", "EUR", "USD"]');
    expect(adminPricing).toContain("Monthly (EUR)");
    expect(adminPricing).toContain("Monthly (USD)");
    expect(adminRoleManager).toContain("approve_admin_role");
    expect(adminRoleManager).toContain("AI: {request.ai_status}");
    expect(workspaceTeamRoles).toContain("const canManagePlatformAdmins = isSuperAdmin;");
    expect(workspaceTeamRoles).toContain("Only the Owner can submit or change platform Admin roles");
  });

  it("resolves platform admins to the Enterprise capability tier", () => {
    const source = read("src/hooks/useSubscription.ts");
    expect(source).toContain("const adminPlanKey: PlanKey");
    expect(source).toContain("plansByKey.enterprise");
    expect(source).toContain('"enterprise"');
  });

  it("allows a first customer to save a profile with one channel", () => {
    const source = read("src/pages/BusinessProfile.tsx");
    expect(source).toContain("{socialChannelCount < 1 && (");
    expect(source).toContain('disabled={upsert.isPending}');
    expect(source).not.toContain("disabled={upsert.isPending || socialChannelCount < 2}");
  });
});
