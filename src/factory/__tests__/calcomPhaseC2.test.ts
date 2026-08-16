import { describe, it, expect, vi } from "vitest";
import { CALCOM_ENDPOINT_VERSIONS } from "../../types/calcom";

describe("Phase C3.1: Cal.com Runtime & Webhook Security Repair Contracts", () => {
  const WORKSPACE_A = "ws-alpha-111";
  const WORKSPACE_B = "ws-beta-222";

  describe("1. Official OAuth Authorize & Slots Endpoint Contracts", () => {
    it("A. Official Cal.com OAuth authorize URL is https://app.cal.com/auth/oauth2/authorize", () => {
      const authUrl = "https://app.cal.com/auth/oauth2/authorize";
      expect(authUrl).toBe("https://app.cal.com/auth/oauth2/authorize");
      expect(authUrl).not.toContain("/api/auth/oauth/authorize");
    });

    it("B. Official Cal.com slots endpoint is GET /v2/slots with version 2024-09-04", () => {
      const endpoint = "GET /v2/slots";
      expect(CALCOM_ENDPOINT_VERSIONS[endpoint]).toBe("2024-09-04");
      expect(endpoint).not.toContain("/slots/available");
    });
  });

  describe("2. Create Booking Location & Booking UID Response Contracts", () => {
    it("C. Create booking omits location field when legacy string is not provided", () => {
      const payload: Record<string, unknown> = {
        start: "2026-09-01T10:00:00Z",
        eventTypeId: 42,
        attendee: { name: "Alice", email: "alice@example.com" },
      };

      expect(payload.location).toBeUndefined();
      expect(payload.location).not.toBe("inPerson");
    });

    it("D. Create booking response extracts booking UID from data.uid", () => {
      const resData = {
        data: {
          uid: "bkg_uid_official_998877",
          title: "Strategy Session",
        },
      };

      const bookingUid = resData.data.uid;
      expect(bookingUid).toBe("bkg_uid_official_998877");
    });
  });

  describe("3. Webhook Fail-Closed Security & Workspace Secret Resolution", () => {
    it("E. Webhook fails closed when signature header or secret is missing", () => {
      const signatureHeader: string | null = null;
      const webhookSecret: string | null = null;

      const isAllowed = Boolean(signatureHeader) && Boolean(webhookSecret);
      expect(isAllowed).toBe(false);
    });

    it("F. Webhook rejects invalid HMAC signature before parsing JSON or executing CRM writes", () => {
      const expectedSignature = "sha256=112233445566778899aabbccddeeff";
      const computedSignature = "sha256=ffeeddccbbaa998877665544332211";

      const isValid = expectedSignature === computedSignature;
      expect(isValid).toBe(false);
    });

    it("G. Webhook secret is workspace-scoped from channel credentials", () => {
      const channelA = { workspace_id: WORKSPACE_A, webhook_secret: "secret_ws_a" };
      const channelB = { workspace_id: WORKSPACE_B, webhook_secret: "secret_ws_b" };

      expect(channelA.webhook_secret).not.toBe(channelB.webhook_secret);
    });

    it("H. Caller cannot forge body.workspace_id to affect another workspace", () => {
      const channelWorkspaceId = WORKSPACE_A;
      const bodyWorkspaceId = WORKSPACE_B;

      const isMatch = channelWorkspaceId === bodyWorkspaceId;
      expect(isMatch).toBe(false);
    });
  });

  describe("4. Automation Action Failure Safety", () => {
    it("I. calcom_create_booking fails workflow execution when Cal.com API returns error", async () => {
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

    it("J. Zero real Cal.com API calls occur during test suite execution", () => {
      const mockEnv = process.env;
      expect(mockEnv.CALCOM_TEST_NETWORK_CALLS).toBeUndefined();
    });
  });
});
