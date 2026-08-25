import { expect, test } from "@playwright/test";

test("Create Account registration choices and orbit are usable on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/register");

  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: /AI-guided setup/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with email/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Facebook/i })).toBeVisible();

  await page.getByRole("button", { name: /AI-guided setup/i }).click();

  const orbit = page.getByRole("listbox", { name: "Choose your account type" });
  await expect(orbit).toBeVisible();

  for (const label of ["Business", "Freelancer", "Ambassador", "White-Label"]) {
    await expect(page.getByRole("option", { name: new RegExp(label, "i") })).toBeVisible();
  }

  const continueButton = page.getByRole("button", { name: /Continue/i });
  await expect(continueButton).toBeDisabled();

  await page.getByRole("option", { name: /Freelancer/i }).click();
  await expect(page.getByRole("option", { name: /Freelancer/i })).toHaveAttribute("aria-selected", "true");
  await expect(continueButton).toBeEnabled();

  const box = await orbit.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport?.width ?? 1440);

  await page.screenshot({ path: testInfo.outputPath("register-account-type.png"), fullPage: true });
});
