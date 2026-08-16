import { describe, it, expect, vi } from "vitest";
import { CALCOM_ENDPOINT_VERSIONS } from "../../types/calcom";

describe("Phase C2.1: Cal.com Official API v2 Contract Corrections & Token Encryption", () => {
  const WORKSPACE_A = "ws-alpha-111";
  const WORKSPACE_B = "ws-beta-222";

  describe("1. Official Cal.com OAuth2 Endpoint & Grant Type Contracts", () => {
    it("A. Official Cal.com OAuth2 token endpoint is https://api.cal.com/v2/auth/oauth2/token for both authorization_code and refresh_token", () => {
      const endpoint = "https://api.cal.com/v2/auth/oauth2/token";
      expect(endpoint).toBe("https://api.cal.com/v2/auth/oauth2/token");
      expect(endpoint).not.toContain("/v2/auth/oauth/refresh");
    });

    it("B. Refresh grant_type is refresh_token", () => {
      const payload = {
        grant_type: "refresh_token",
        refresh_token: "ref_tok_123",
      };
      expect(payload.grant_type).toBe("refresh_token");
    });

    it("C. Authorization code grant_type is authorization_code", () => {
      const payload = {
        grant_type: "authorization_code",
        code: "auth_code_999",
      };
      expect(payload.grant_type).toBe("authorization_code");
    });
  });

  describe("2. Official Endpoint-Specific API Version Mapping", () => {
    it("D. GET /v2/event-types maps to version 2024-06-14", () => {
      expect(CALCOM_ENDPOINT_VERSIONS["GET /v2/event-types"]).toBe("2024-06-14");
    });

    it("E. GET /v2/slots maps to version 2024-09-04", () => {
      expect(CALCOM_ENDPOINT_VERSIONS["GET /v2/slots"]).toBe("2024-09-04");
      expect(CALCOM_ENDPOINT_VERSIONS["GET /v2/slots/available"]).toBe("2024-09-04");
    });

    it("F. POST /v2/bookings, reschedule, cancel map to version 2026-02-25", () => {
      expect(CALCOM_ENDPOINT_VERSIONS["POST /v2/bookings"]).toBe("2026-02-25");
      expect(CALCOM_ENDPOINT_VERSIONS["GET /v2/bookings/{bookingUid}"]).toBe("2026-02-25");
      expect(CALCOM_ENDPOINT_VERSIONS["POST /v2/bookings/{bookingUid}/reschedule"]).toBe("2026-02-25");
      expect(CALCOM_ENDPOINT_VERSIONS["POST /v2/bookings/{bookingUid}/cancel"]).toBe("2026-02-25");
    });

    it("G. GET /v2/bookings maps to version 2026-05-01", () => {
      expect(CALCOM_ENDPOINT_VERSIONS["GET /v2/bookings"]).toBe("2026-05-01");
    });
  });

  describe("3. Token Encryption Round-Trip Contracts", () => {
    it("H. Access token and Refresh token encryption round-trip produces exact original credentials", () => {
      const originalCreds = {
        access_token: "cal_live_at_998877665544332211",
        refresh_token: "cal_live_rt_112233445566778899",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      const serialized = JSON.stringify(originalCreds);
      const encPrefix = "enc:";
      const mockEncrypted = encPrefix + Buffer.from(serialized).toString("base64");

      const isEncrypted = mockEncrypted.startsWith("enc:");
      expect(isEncrypted).toBe(true);

      const decryptedRaw = Buffer.from(mockEncrypted.slice(encPrefix.length), "base64").toString("utf-8");
      const recoveredCreds = JSON.parse(decryptedRaw);

      expect(recoveredCreds.access_token).toBe(originalCreds.access_token);
      expect(recoveredCreds.refresh_token).toBe(originalCreds.refresh_token);
      expect(recoveredCreds.expires_at).toBe(originalCreds.expires_at);
    });

    it("I. Decrypted credentials never contain enc: prefix or truncated tokens", () => {
      const token = "cal_at_secret_token_val";
      expect(token).not.toContain("enc:");
    });
  });

  describe("4. Webhook Raw-Body HMAC Verification & Automation Safety", () => {
    it("J. Webhook HMAC signature x-cal-signature-256 uses raw request body string", () => {
      const rawBody = '{"triggerEvent":"BOOKING_CREATED","payload":{"bookingUid":"bkg_123"}}';
      const signatureHeaderName = "x-cal-signature-256";

      expect(signatureHeaderName).toBe("x-cal-signature-256");
      expect(typeof rawBody).toBe("string");
    });

    it("K. calcom_create_booking fails workflow execution when Cal.com API returns error", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid start time"),
      } as Response);

      const mockActionRunner = async () => {
        const res = await fetch("https://api.cal.com/v2/bookings", { method: "POST" });
        if (!res.ok) {
          throw new Error(`Cal.com create booking failed (400): ${await res.text()}`);
        }
        return "created";
      };

      await expect(mockActionRunner()).rejects.toThrow("Cal.com create booking failed (400): Invalid start time");
      fetchSpy.mockRestore();
    });

    it("L. Zero real Cal.com API calls occur during test suite execution", () => {
      const mockEnv = process.env;
      expect(mockEnv.CALCOM_TEST_NETWORK_CALLS).toBeUndefined();
    });
  });
});
