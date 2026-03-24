import { test, expect } from "@playwright/test";

test("main page has no console errors on load", async ({ page }) => {
  const consoleErrors = [];
  const errorResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      errorResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      errorResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  await page.goto("http://localhost:5173");
  await page.waitForTimeout(1000);

  // Ignore the expected unauthenticated /me 401 error
  const unexpectedErrorResponses = errorResponses.filter(
    res => !(res.url.endsWith('/me') && res.status === 401)
  );

  expect(unexpectedErrorResponses).toHaveLength(0);
  const unexpectedConsoleErrors = consoleErrors.filter(
    error => error !== 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  );

  expect(unexpectedConsoleErrors).toHaveLength(0);
});

