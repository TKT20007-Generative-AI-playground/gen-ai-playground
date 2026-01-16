import { test, expect } from "@playwright/test";

test("hello world näkyy Flask skeletonin etusivulla", async ({ page }) => {
  await page.goto("http://localhost:5000/");
  await expect(page.locator("body")).toHaveText("Hello, World!");
});
