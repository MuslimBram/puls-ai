import { expect, test } from "@playwright/test";

function baseOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  return new URL(baseURL).origin;
}

test.describe("MR8E browser release preflight", () => {
  test("public landing renders on the configured deployment origin", async ({ page }, testInfo) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response, "landing must return an HTTP response").not.toBeNull();
    expect(response!.status(), "landing must not return a server error").toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    expect(new URL(page.url()).origin).toBe(baseOrigin(testInfo.project.use.baseURL));
  });

  test("login and register are publicly reachable without embedded credentials", async ({ page }, testInfo) => {
    for (const path of ["/login", "/register"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response, `${path} must return an HTTP response`).not.toBeNull();
      expect(response!.status(), `${path} must not return a server error`).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      expect(new URL(page.url()).origin).toBe(baseOrigin(testInfo.project.use.baseURL));
    }
  });

  test("unauthenticated dashboard fails closed to login", async ({ page }, testInfo) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
    expect(new URL(page.url()).origin).toBe(baseOrigin(testInfo.project.use.baseURL));
  });

  test("public developers route stays on the same configured domain", async ({ page }, testInfo) => {
    const response = await page.goto("/platform/developers", { waitUntil: "domcontentloaded" });
    expect(response, "developers route must return an HTTP response").not.toBeNull();
    expect(response!.status(), "developers route must not return a server error").toBeLessThan(500);
    await expect(page).toHaveURL(/\/(?:en|sq)\/platform\/developers(?:[?#].*)?$/);
    expect(new URL(page.url()).origin).toBe(baseOrigin(testInfo.project.use.baseURL));
  });

  test("browser preflight never exposes LEAH server secret names", async ({ page }) => {
    const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    const html = await page.locator("html").innerHTML();
    expect(html).not.toMatch(/LEAH_WORKER_SECRET|SUPABASE_SERVICE_ROLE_KEY|LEAH_OPENAI_CODE_API_KEY/);
  });
});
