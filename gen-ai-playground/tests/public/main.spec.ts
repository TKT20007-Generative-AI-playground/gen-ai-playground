import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

test("main page has no console errors on load", async ({ page }) => {
  const consoleErrors = [];
  const errorResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("response", response => {
    if (response.status() >= 400) {
      errorResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  await page.goto(FRONTEND_URL);
  await page.waitForTimeout(1000);

  // Ignore the expected unauthenticated /me 401 error
  const unexpectedErrorResponses = errorResponses.filter(
    res => !(
      res.status === 401
      && (res.url.endsWith('/me') || res.url.endsWith('/refresh'))
    )
  );

  expect(unexpectedErrorResponses).toHaveLength(0);
  const unexpectedConsoleErrors = consoleErrors.filter(
    error => error !== 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  );

  expect(unexpectedConsoleErrors).toHaveLength(0);
});

