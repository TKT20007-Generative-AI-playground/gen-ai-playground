import { test, expect } from "@playwright/test";

test("Hello World is displayed on the FastAPI skeleton homepage", async ({ page }) => {
  await page.goto("http://localhost:5000/");
  await expect(page.locator("body")).toHaveText("Hello, World!");
});
