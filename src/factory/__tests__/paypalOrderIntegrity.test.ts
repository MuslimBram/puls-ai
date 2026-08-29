import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const createOrder = readFileSync(resolve(process.cwd(), "supabase/functions/create-paypal-order/index.ts"), "utf8");
const captureOrder = readFileSync(resolve(process.cwd(), "supabase/functions/capture-paypal-order/index.ts"), "utf8");
const pricing = readFileSync(resolve(process.cwd(), "src/pages/Pricing.tsx"), "utf8");
const completePayment = readFileSync(resolve(process.cwd(), "src/pages/CompletePayment.tsx"), "utf8");

describe("PayPal order integrity", () => {
  it("derives plan settlement totals from canonical currency-specific pricing", () => {
    expect(createOrder).toContain("monthly_price_eur");
    expect(createOrder).toContain("monthly_price_usd");
    expect(createOrder).toContain("monthly_price_all");
    expect(createOrder).toContain("pricing_settings");
    expect(createOrder).toContain("Requested PayPal package does not match the canonical pricing catalog");
    expect(createOrder).toContain("amount = purchase.amount");
    expect(createOrder).not.toContain("value: Number(amount).toFixed(2)");
  });

  it("supports both current pricing callers without trusting their amount as settlement truth", () => {
    expect(pricing).toContain('functions.invoke("create-paypal-order"');
    expect(completePayment).toContain('functions.invoke("create-paypal-order"');
    expect(createOrder).toContain("allDisplayCandidate");
    expect(createOrder).toContain("settlementCandidate");
    expect(createOrder).toContain("settlementAmount");
  });

  it("rejects unsupported PayPal settlement currencies", () => {
    expect(createOrder).toContain('value === "EUR" || value === "USD"');
    expect(createOrder).toContain("PayPal checkout supports EUR or USD only");
  });

  it("binds every capture to the authenticated owner", () => {
    expect(captureOrder).toContain('.eq("paypal_order_id", orderId)');
    expect(captureOrder).toContain('.eq("user_id", user.id)');
    expect(captureOrder).toContain("PayPal order does not belong to the authenticated user");
    expect(captureOrder).toContain("customId !== user.id");
  });

  it("verifies amount and currency both before and after capture", () => {
    expect(captureOrder).toContain("assertOrderMoney(orderCheck, expectedAmount, expectedCurrency)");
    expect(captureOrder).toContain("assertCaptureMoney(capture, expectedAmount, expectedCurrency)");
    expect(captureOrder).toContain("PayPal order amount/currency does not match the stored transaction");
    expect(captureOrder).toContain("PayPal captured amount/currency does not match the stored transaction");
  });

  it("writes billing history from trusted stored transaction values", () => {
    expect(captureOrder).toContain("workspace_id: txn.workspace_id ?? null");
    expect(captureOrder).toContain("amount: expectedAmount");
    expect(captureOrder).toContain("currency: expectedCurrency");
    expect(captureOrder).toContain('payment_method: "paypal"');
  });
});
