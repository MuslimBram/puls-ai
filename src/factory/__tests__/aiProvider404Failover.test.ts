import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  clearInProcessCooldowns,
  executeWithFailover,
  isEligibleForProviderFailover,
} from "../../../supabase/functions/_shared/failover-router";

describe("AI provider 404 failover", () => {
  it("classifies provider/model 404 as configuration failure eligible for failover", () => {
    const category = classifyProviderFailure(404, "Groq: http_error (404)");
    expect(category).toBe("AUTH_OR_CONFIG_FAILURE");
    expect(isEligibleForProviderFailover(category)).toBe(true);
  });

  it("keeps malformed 400 requests non-failoverable", () => {
    const category = classifyProviderFailure(400, "provider: permanent_failure (400)");
    expect(category).toBe("UNSUPPORTED_REQUEST");
    expect(isEligibleForProviderFailover(category)).toBe(false);
  });

  it("continues to the next provider after a 404", async () => {
    clearInProcessCooldowns();
    const calls: string[] = [];

    const result = await executeWithFailover(
      ["broken-provider", "healthy-provider"],
      async (providerKey) => {
        calls.push(providerKey);
        if (providerKey === "broken-provider") {
          throw new Error("Broken model: http_error (404)");
        }
        return "ok";
      },
      (providerKey) => providerKey,
    );

    expect(calls).toEqual(["broken-provider", "healthy-provider"]);
    expect(result.value).toBe("ok");
    expect(result.providerKey).toBe("healthy-provider");
    expect(result.fallbackUsed).toBe(true);
    expect(result.totalAttempts).toBe(2);
  });
});
