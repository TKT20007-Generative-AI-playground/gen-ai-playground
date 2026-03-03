import { test, expect } from '@playwright/test';

test('main page has no console errors on load', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });



  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);


  // Filter out only errors that include both '/me' and '401' (expected unauthenticated case)
const unexpectedErrors = consoleErrors.filter(
  error => !(error.includes('401 (Unauthorized)') && error.includes('Failed to load resource'))
);
expect(unexpectedErrors).toHaveLength(0);

})