import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Partner Bulk Billing
 * 
 * Generates a single aggregated invoice for partners managing multiple businesses.
 * 
 * POST { partner_id }
 *   → calculates total across all managed workspaces
 *   → applies partner discount
 *   → creates a single Stripe invoice with line items per business
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) throw new Error("Unauthorized");

    const { partner_id, action } = await req.json();

    // Get partner account
    const { data: partner, error: partnerErr } = await supabase
      .from("partner_accounts")
      .select("*")
      .eq("id", partner_id)
      .eq("user_id", userData.user.id)
      .single();
    if (partnerErr || !partner) throw new Error("Partner not found");
    if (partner.status !== "active") throw new Error("Partner account not active");

    // Load plan prices from dynamic table
    const { data: planRows } = await supabase
      .from("stripe_product_plans")
      .select("plan_name, monthly_price")
      .eq("is_active", true);

    const planPrices: Record<string, number> = {};
    for (const row of planRows || []) {
      planPrices[row.plan_name] = Number(row.monthly_price);
    }
    // Fallback
    if (Object.keys(planPrices).length === 0) {
      Object.assign(planPrices, { standard: 29, professional: 79, advanced: 149, enterprise: 399 });
    }

    if (action === "preview") {
      // Get all managed workspaces and their subscriptions
      const { data: businesses } = await supabase
        .from("partner_businesses")
        .select("workspace_id, workspaces(name)")
        .eq("partner_id", partner_id);

      if (!businesses || businesses.length === 0) {
        return new Response(JSON.stringify({ line_items: [], total: 0, discount: 0, final_total: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const wsIds = businesses.map((b: any) => b.workspace_id);
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("workspace_id, plan")
        .in("workspace_id", wsIds);

      const lineItems = (subs || []).map((sub: any) => {
        const biz = businesses.find((b: any) => b.workspace_id === sub.workspace_id);
        const price = planPrices[sub.plan] || 0;
        return {
          workspace_id: sub.workspace_id,
          business_name: (biz as any)?.workspaces?.name || "Unknown",
          plan: sub.plan,
          amount: price,
        };
      });

      const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0);
      const discountPercent = partner.discount_percent || 0;
      const discountAmount = (subtotal * discountPercent) / 100;
      const finalTotal = subtotal - discountAmount;

      return new Response(JSON.stringify({
        line_items: lineItems,
        subtotal,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        final_total: finalTotal,
        business_count: lineItems.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_invoice") {
      // Ensure partner has a Stripe customer
      let stripeCustomerId = partner.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userData.user.email || undefined,
          name: partner.partner_name,
          metadata: { partner_id: partner.id, type: "partner_bulk" },
        });
        stripeCustomerId = customer.id;
        await supabase.from("partner_accounts").update({
          stripe_customer_id: stripeCustomerId,
        } as any).eq("id", partner_id);
      }

      // Get line items
      const { data: businesses } = await supabase
        .from("partner_businesses")
        .select("workspace_id, workspaces(name)")
        .eq("partner_id", partner_id);

      const wsIds = (businesses || []).map((b: any) => b.workspace_id);
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("workspace_id, plan")
        .in("workspace_id", wsIds.length > 0 ? wsIds : ["none"]);

      if (!subs || subs.length === 0) throw new Error("No active subscriptions to bill");

      // Create invoice
      const invoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 14,
        metadata: { partner_id: partner.id, type: "bulk_billing" },
      });

      // Add line items
      for (const sub of subs) {
        const biz = (businesses || []).find((b: any) => b.workspace_id === sub.workspace_id);
        const price = planPrices[sub.plan] || 0;
        const discountedPrice = price * (1 - (partner.discount_percent || 0) / 100);

        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice: invoice.id,
          amount: Math.round(discountedPrice * 100), // cents
          currency: "usd",
          description: `${(biz as any)?.workspaces?.name || "Business"} — ${sub.plan} plan (${partner.discount_percent}% partner discount)`,
        });
      }

      // Finalize
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

      // Record in billing history
      const totalAmount = (finalizedInvoice.total || 0) / 100;
      await supabase.from("billing_history").insert({
        user_id: userData.user.id,
        amount: totalAmount,
        currency: "usd",
        status: "open",
        description: `Partner bulk invoice — ${subs.length} businesses`,
        plan_name: "partner_bulk",
        stripe_invoice_id: finalizedInvoice.id,
        invoice_url: finalizedInvoice.hosted_invoice_url,
        invoice_pdf: finalizedInvoice.invoice_pdf,
      });

      return new Response(JSON.stringify({
        invoice_id: finalizedInvoice.id,
        invoice_url: finalizedInvoice.hosted_invoice_url,
        invoice_pdf: finalizedInvoice.invoice_pdf,
        total: totalAmount,
        business_count: subs.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("[PARTNER-BULK-BILLING] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
