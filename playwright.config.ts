import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL?.trim();
if (process.env.CI && !stagingUrl) {
  throw new Error("STAGING_URL is required for Playwright in CI; refusing a stale or implicit deployment target");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: stagingUrl || "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
