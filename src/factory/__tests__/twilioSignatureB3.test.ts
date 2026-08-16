import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyTwilioSignature } from "../../../supabase/functions/_shared/webhook-signatures.ts";

describe("B3: Twilio-TwiML Real Signature Security Verification", () => {
  const testAuthToken = "test_twilio_auth_token_secret_12345";
  const origEnv = process.env.TWILIO_AUTH_TOKEN;

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = testAuthToken;
  });

  afterEach(() => {
    process.env.TWILIO_AUTH_TOKEN = origEnv;
  });

  it("A. Missing X-Twilio-Signature header -> REJECT", async () => {
    const req = new Request("https://example.supabase.co/functions/v1/twilio-twiml?type=outbound", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const result = await verifyTwilioSignature(req, "", "application/x-www-form-urlencoded", testAuthToken);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_signature_header");
  });

  it("B. Invalid signature header -> REJECT", async () => {
    const req = new Request("https://example.supabase.co/functions/v1/twilio-twiml?type=outbound", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "invalid_forged_base64_sig==",
      },
    });
    const result = await verifyTwilioSignature(req, "", "application/x-www-form-urlencoded", testAuthToken);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("C. Valid signature header -> SUCCESS", async () => {
    // Generate valid HMAC-SHA1 signature for URL
    const url = "https://example.supabase.co/functions/v1/twilio-twiml?type=outbound";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(testAuthToken),
      { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(url));
    const validSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    const req = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-twilio-signature": validSig,
        "host": "example.supabase.co",
        "x-forwarded-proto": "https",
      },
    });

    const result = await verifyTwilioSignature(req, "", "application/json", testAuthToken);
    expect(result.ok).toBe(true);
  });
});
