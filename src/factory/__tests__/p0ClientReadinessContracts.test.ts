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
    expect(source).not.toMatch(/\\n\\s*packageEndsAt\\.setDate\\(packageEndsAt\\.getDate\\(\\) \\+ trialDays\\);/);
  });

  it("connects completed billing to the LEAH lifecycle", () => {
    const stripe = read("supabase/functions/stripe-webhook/index.ts");
    const paypal = read("supabase/functions/capture-paypal-order/index.ts");
    expect(stripe).toContain('supabase.rpc("leah_apply_billing_entitlement_event"');
    expect(stripe).toContain("providerEventId");
    expect(stripe).toContain('status: "failed"');
    expect(paypal).toContain('payment_status: "paid"');
    expect(paypal).toContain('supabase.rpc("leah_apply_billing_entitlement_event"');
  });

  it("allows a first customer to save a profile with one channel", () => {
    const source = read("src/pages/BusinessProfile.tsx");
    expect(source).toContain("{socialChannelCount < 1 && (");
    expect(source).toContain('disabled={upsert.isPending}');
    expect(source).not.toContain("disabled={upsert.isPending || socialChannelCount < 2}");
  });
});
