import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const oauth = read("src/integrations/auth/oauth.ts");
const login = read("src/pages/Login.tsx");
const register = read("src/pages/Register.tsx");
const callback = read("src/pages/AuthCallback.tsx");
const app = read("src/App.tsx");

describe("Facebook authentication and registration E2E code contract", () => {
  it("exposes Facebook through the canonical Supabase OAuth wrapper", () => {
    expect(oauth).toContain('provider: "google" | "facebook" | "apple"');
    expect(oauth).toContain("supabase.auth.signInWithOAuth");
    expect(oauth).toContain('`${window.location.origin}/auth/callback`');
  });

  it("offers Facebook on the sign-in surface", () => {
    expect(login).toContain('signInWithOAuth("facebook"');
    expect(login).toContain("Continue with Facebook");
  });

  it("offers Facebook on the registration surface alongside Google and Apple", () => {
    expect(register).toContain('handleSocialRegister("google")');
    expect(register).toContain('handleSocialRegister("facebook")');
    expect(register).toContain('handleSocialRegister("apple")');
    expect(register).toContain("Continue with Google");
    expect(register).toContain("Continue with Facebook");
    expect(register).toContain("Continue with Apple");
  });

  it("uses the canonical callback route and authenticated dashboard destination", () => {
    expect(app).toContain('path="/auth/callback"');
    expect(callback).toContain('?? "/dashboard"');
    expect(callback).toContain("supabase.auth.getSession()");
    expect(callback).toContain("window.location.replace(safeNext)");
  });
});
