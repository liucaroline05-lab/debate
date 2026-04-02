import { test, expect } from "@playwright/test";

test("homepage and signup flow shell render", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Build calm confidence, sharper cases, and better rounds.",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Start free" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Open a calm, structured home for your debate work.",
    }),
  ).toBeVisible();
});
