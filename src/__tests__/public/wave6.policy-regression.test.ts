import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BLOCKED_SQ_PATHS, PUBLIC_INDEXABLE_PATHS } from "@/lib/publicSeo";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Wave 6 regression boundaries", () => {
  it("keeps the approved blocked-SQ list exact and explicit", () => {
    expect(Array.from(BLOCKED_SQ_PATHS).sort()).toEqual([
      "/affiliate-terms",
      "/cookies",
      "/dpa",
      "/privacy",
      "/refund",
      "/terms",
      "/terms-and-payments",
      "/white-label",
    ]);
  });

  it("keeps all Wave 3 platform discovery surfaces in the public indexable registry", () => {
    const paths = new Set(PUBLIC_INDEXABLE_PATHS);
    [
      "/platform",
      "/platform/ai",
      "/platform/unified-inbox",
      "/platform/crm",
      "/platform/marketing",
      "/platform/automation",
      "/platform/analytics",
      "/platform/developers",
      "/platform/partners",
      "/platform/lidhjet",
    ].forEach((path) => expect(paths.has(path as never)).toBe(true));
  });

  it("does not touch AI-2 or SOCIAL-1D implementation files from Wave 6 code", () => {
    const seo = source("src/components/Seo.tsx");
    const discovery = source("src/lib/publicDiscovery.ts");
    const policy = source("src/lib/publicSeo.ts");
    const combined = `${seo}\n${discovery}\n${policy}`;
    expect(combined).not.toContain("pulse-ai-facade");
    expect(combined).not.toContain("social-intent");
    expect(combined).not.toContain("ai-action-approve");
  });

  it("keeps public-site domain migration configuration-driven", () => {
    expect(source(".env.example")).toContain("VITE_PUBLIC_SITE_URL");
    expect(source("vite.config.ts")).toContain("VITE_PUBLIC_SITE_URL");
    expect(source("src/lib/publicSeo.ts")).toContain("VITE_PUBLIC_SITE_URL");
  });
});
