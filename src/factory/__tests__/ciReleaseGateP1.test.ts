import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("P1: CI/CD Release Gate Configuration & Migration Hygiene", () => {
  it("A. .github/workflows/ci.yml exists and defines npm ci, lint, vitest, migration validation, build", () => {
    const ciPath = join(process.cwd(), ".github", "workflows", "ci.yml");
    expect(existsSync(ciPath)).toBe(true);

    const content = readFileSync(ciPath, "utf-8");
    expect(content).toContain("npm ci");
    expect(content).toContain("npx eslint");
    expect(content).toContain("npx vitest run");
    expect(content).toContain("npm run build");
    expect(content).toContain("Migration sequence valid");
  });

  it("B. Playwright config exists for Golden Flow E2E testing", () => {
    const pwPath = join(process.cwd(), "playwright.config.ts");
    expect(existsSync(pwPath)).toBe(true);
  });
});
