/**
 * PayPal must be explicitly pinned to sandbox or live mode.
 * Fail closed when the flag is missing or malformed so order creation,
 * capture, and webhook verification can never target different environments.
 */
export function getPayPalSandboxMode(): boolean {
  const raw = Deno.env.get("PAYPAL_SANDBOX");
  if (raw !== "true" && raw !== "false") {
    throw new Error("PAYPAL_SANDBOX must be explicitly configured as true or false");
  }
  return raw === "true";
}
