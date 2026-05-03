import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData.user;
    if (!user) return json(req, { error: "Unauthorized" }, 401);

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return json(req, { error: "Forbidden" }, 403);
    }

    const checks: CheckResult[] = [];

    // ---- PayPal config ----
    const ppClient = Deno.env.get("PAYPAL_CLIENT_ID");
    const ppSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const ppWebhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    const sandbox = Deno.env.get("PAYPAL_SANDBOX") !== "false";

    if (!ppClient || !ppSecret) {
      checks.push({ name: "PayPal credentials", status: "fail", message: "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing" });
    } else {
      const base = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      try {
        const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${ppClient}:${ppSecret}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });
        if (tokenRes.ok) {
          checks.push({ name: "PayPal OAuth", status: "ok", message: `Authenticated (${sandbox ? "sandbox" : "live"})` });
        } else {
          const text = await tokenRes.text();
          checks.push({ name: "PayPal OAuth", status: "fail", message: `Auth failed: ${text.slice(0, 120)}` });
        }
      } catch (e) {
        checks.push({ name: "PayPal OAuth", status: "fail", message: `Network error: ${(e as Error).message}` });
      }
    }

    if (!ppWebhookId) {
      checks.push({ name: "PayPal webhook ID", status: "fail", message: "PAYPAL_WEBHOOK_ID not configured (signature verification disabled)" });
    } else {
      checks.push({ name: "PayPal webhook ID", status: "ok", message: "Configured" });
    }

    // ---- Stripe ----
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeWhSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) {
      checks.push({ name: "Stripe key", status: "warn", message: "STRIPE_SECRET_KEY not configured" });
    } else {
      try {
        const r = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (r.ok) {
          checks.push({ name: "Stripe API", status: "ok", message: "Authenticated" });
        } else {
          const t = await r.text();
          checks.push({ name: "Stripe API", status: "fail", message: `Invalid key: ${t.slice(0, 120)}` });
        }
      } catch (e) {
        checks.push({ name: "Stripe API", status: "fail", message: (e as Error).message });
      }
    }
    checks.push({
      name: "Stripe webhook secret",
      status: stripeWhSecret ? "ok" : "warn",
      message: stripeWhSecret ? "Configured" : "Not configured",
    });

    // ---- Consistency ----
    const { data: consistency, error: cErr } = await supabase.rpc("billing_consistency_report");
    if (cErr) {
      checks.push({ name: "Billing consistency", status: "fail", message: cErr.message });
    } else {
      const c: any = consistency;
      checks.push({
        name: "Billing consistency",
        status: c?.is_healthy ? "ok" : "warn",
        message: c?.is_healthy ? "All records aligned" : "Mismatches detected — see details",
      });
    }

    const failed = checks.filter((c) => c.status === "fail").length;
    const warned = checks.filter((c) => c.status === "warn").length;

    return json(req, {
      generated_at: new Date().toISOString(),
      overall: failed > 0 ? "fail" : warned > 0 ? "warn" : "ok",
      checks,
      consistency,
    });
  } catch (e) {
    console.error("[payment-health-check]", e);
    return json(req, { error: (e as Error).message }, 500);
  }
});
