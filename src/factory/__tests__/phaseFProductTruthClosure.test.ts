import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const stripeWebhook = readFileSync(
  resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"),
  "utf8",
);
const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as { redirects?: Array<{ source: string; destination: string; permanent?: boolean }> };

describe("Phase F product truth closure", () => {
  it("never invents a fallback partner commission percentage", () => {
    expect(stripeWebhook).not.toContain("partner.commission_rate || 10");
    expect(stripeWebhook).toContain("Number(partner.commission_rate ?? 0)");
  });

  it("retires the legacy public landing page with hardcoded commercial claims", () => {
    expect(vercelConfig.redirects).toContainEqual({
      source: "/landing",
      destination: "/",
      permanent: true,
    });
  });
});
