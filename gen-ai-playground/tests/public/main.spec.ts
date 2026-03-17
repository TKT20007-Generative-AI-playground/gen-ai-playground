import { test, expect } from "@playwright/test";

test("main page has no console errors on load", async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("http://localhost:5173");
  await page.waitForTimeout(1000);

  expect(consoleErrors).toHaveLength(0);
});
