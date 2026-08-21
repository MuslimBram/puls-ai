import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateInternalPath, safeNavigate } from "./safeNavigate";

// jsdom sets window.location.origin to "http://localhost"
const ORIGIN = "http://localhost";

describe("validateInternalPath", () => {
  // ── Accepted paths ──────────────────────────────────────────────────────────
  it("accepts root /", () => {
    expect(validateInternalPath("/")).toBe("/");
  });

  it("accepts /dashboard", () => {
    expect(validateInternalPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts pathname with query string", () => {
    expect(validateInternalPath("/leads?id=123")).toBe("/leads?id=123");
  });

  it("accepts pathname with hash", () => {
    expect(validateInternalPath("/settings#billing")).toBe("/settings#billing");
  });

  it("accepts pathname with query string and hash", () => {
    expect(validateInternalPath("/pricing?plan=pro#compare")).toBe(
      "/pricing?plan=pro#compare",
    );
  });

  // ── Rejected paths ──────────────────────────────────────────────────────────
  it("rejects protocol-relative //evil.com", () => {
    expect(validateInternalPath("//evil.com")).toBeNull();
  });

  it("rejects backslash-prefixed \\\\evil.com", () => {
    expect(validateInternalPath("\\evil.com")).toBeNull();
  });

  it("rejects /\\\\evil.com (backslash after slash)", () => {
    expect(validateInternalPath("/\\evil.com")).toBeNull();
  });

  it("rejects https://evil.com", () => {
    expect(validateInternalPath("https://evil.com")).toBeNull();
  });

  it("rejects http://evil.com", () => {
    expect(validateInternalPath("http://evil.com")).toBeNull();
  });

  it("rejects javascript:alert(1)", () => {
    expect(validateInternalPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects data:text/html,<script>", () => {
    expect(validateInternalPath("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects relative path without leading slash", () => {
    expect(validateInternalPath("evil.com")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateInternalPath("")).toBeNull();
  });

  it("rejects null", () => {
    expect(validateInternalPath(null)).toBeNull();
  });

  it("rejects undefined", () => {
    expect(validateInternalPath(undefined)).toBeNull();
  });

  it("rejects ///evil.com (triple slash)", () => {
    expect(validateInternalPath("///evil.com")).toBeNull();
  });
});

// ── safeNavigate wrapper ─────────────────────────────────────────────────────
describe("safeNavigate", () => {
  it("calls navigate for a valid internal path and returns true", () => {
    let called = "";
    const navigate = (to: string) => { called = to; };
    const result = safeNavigate(navigate, "/dashboard");
    expect(result).toBe(true);
    expect(called).toBe("/dashboard");
  });

  it("does NOT call navigate for external URL and returns false", () => {
    let called = "";
    const navigate = (to: string) => { called = to; };
    const result = safeNavigate(navigate, "https://evil.com");
    expect(result).toBe(false);
    expect(called).toBe("");
  });

  it("does NOT call navigate for null and returns false", () => {
    let called = "";
    const navigate = (to: string) => { called = to; };
    const result = safeNavigate(navigate, null);
    expect(result).toBe(false);
    expect(called).toBe("");
  });

  it("does NOT call navigate for backslash path", () => {
    let called = "";
    const navigate = (to: string) => { called = to; };
    const result = safeNavigate(navigate, "\\evil.com");
    expect(result).toBe(false);
    expect(called).toBe("");
  });

  // Simulates NotificationBell: n.action_url from DB
  it("handles NotificationBell dynamic action_url — internal path accepted", () => {
    let navigated = "";
    const navigate = (to: string) => { navigated = to; };
    const n = { action_url: "/business-insights?tab=alerts" };
    safeNavigate(navigate, n.action_url);
    expect(navigated).toBe("/business-insights?tab=alerts");
  });

  it("handles NotificationBell dynamic action_url — external URL rejected", () => {
    let navigated = "";
    const navigate = (to: string) => { navigated = to; };
    const n = { action_url: "https://evil.com/steal" };
    safeNavigate(navigate, n.action_url);
    expect(navigated).toBe("");
  });

  // Simulates AISetupAssistant: progress.current_step.url from DB/API
  it("handles AISetupAssistant step url — internal path accepted", () => {
    let navigated = "";
    const navigate = (to: string) => { navigated = to; };
    const progress = { current_step: { url: "/ai-training" } };
    safeNavigate(navigate, progress.current_step.url);
    expect(navigated).toBe("/ai-training");
  });

  it("handles AISetupAssistant step url — javascript: scheme rejected", () => {
    let navigated = "";
    const navigate = (to: string) => { navigated = to; };
    const progress = { current_step: { url: "javascript:void(0)" } };
    safeNavigate(navigate, progress.current_step.url);
    expect(navigated).toBe("");
  });
});
