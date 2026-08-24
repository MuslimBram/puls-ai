import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const oauth = read("src/integrations/auth/oauth.ts");
const login = read("src/pages/Login.tsx");
const register = read("src/pages/Register.tsx");
const callback = read("src/pages/AuthCallback.tsx");
const app = read("src/App.tsx");

describe("Apple auth E2E code contract", () => {
  it("exposes Apple through the canonical Supabase OAuth wrapper", () => {
    expect(oauth).toContain('provider: "google" | "apple"');
    expect(oauth).toContain('supabase.auth.signInWithOAuth');
    expect(login).toContain('signInWithOAuth("apple"');
    expect(register).toContain('signInWithOAuth("apple"');
  });

  it("normalizes OAuth completion onto /auth/callback and fails closed cross-origin", () => {
    expect(oauth).toContain('`${window.location.origin}/auth/callback`');
    expect(oauth).toContain('parsed.origin !== window.location.origin) return fallback');
    expect(oauth).toContain('parsed.pathname = "/auth/callback"');
    expect(app).toContain('path="/auth/callback"');
  });

  it("preserves only validated internal post-auth destinations", () => {
    expect(callback).toContain('validateInternalPath(params.get("next")) ?? "/dashboard"');
    expect(callback).toContain('window.location.replace(safeNext)');
    expect(callback).toContain('encodeURIComponent(safeNext)');
  });

  it("cleans up auth subscriptions and fallback timers", () => {
    expect(callback).toContain('clearTimeout(fallbackTimer)');
    expect(callback).toContain('unsubscribe?.()');
  });
});
