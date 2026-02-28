import { test, expect } from '@playwright/test';

test('main page has no console errors on load', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Ignore expected 401 from /me endpoint for unauthenticated users
  page.on('response', response => {
    if (response.url().includes('/me') && response.status() === 401) {
      // Expected - user is not logged in
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Filter out expected network errors (401 from /me when not authenticated)
  const unexpectedErrors = consoleErrors.filter(
    error => !error.includes('401') && !error.includes('/me')
  );

  expect(unexpectedErrors).toHaveLength(0);

})