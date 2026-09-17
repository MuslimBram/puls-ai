import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf-8");

describe("OAuth callback route safety", () => {
  it("defines the OAuthCallback lazy component before routing to it", () => {
    expect(appSource).toContain(
      'const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));',
    );
    expect(appSource).toContain(
      '<Route path="/oauth/callback" element={<Suspense fallback={<LazyFallback />}><OAuthCallback /></Suspense>} />',
    );
  });
});
