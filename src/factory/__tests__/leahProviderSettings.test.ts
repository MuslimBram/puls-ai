import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = read("src/pages/LeahProviderSettings.tsx");
const app = read("src/App.tsx");
const nav = read("src/components/layout/nav-config.ts");

describe("LEAH OpenAI BYOK owner flow", () => {
  it("is lazy-loaded behind the authenticated protected route", () => {
    expect(app).toContain('lazy(() => import("./pages/LeahProviderSettings"))');
    expect(app).toContain(
      '<Route path="/leah/providers" element={<ProtectedPage><LeahProviderSettings /></ProtectedPage>} />',
    );
    expect(nav).toContain('{ href: "/leah/providers", label: "LEAH Providers", icon: Key }');
  });

  it("uses only the protected LEAH session and provider actions", () => {
    expect(page).toContain('"leah-session"');
    expect(page).toContain('"X-Leah-Session"');
    expect(page).toContain('"provider.list"');
    expect(page).toContain('"provider.save"');
    expect(page).toContain('"provider.test"');
  });

  it("keeps the provider credential out of persistent browser storage", () => {
    expect(page).toContain('type="password"');
    expect(page).toContain('autoComplete="new-password"');
    expect(page).toContain('if (apiKeyRef.current) apiKeyRef.current.value = ""');
    expect(page).not.toMatch(/localStorage|sessionStorage/);
    expect(page).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });
});

