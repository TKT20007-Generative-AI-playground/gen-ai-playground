import { test, expect } from '@playwright/test';

test('main page has no console errors on load', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      status: request.response() ? request.response().status() : null,
      failure: request.failure()
    });
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Ignore the expected unauthenticated /me 401 error
  const unexpectedFailedRequests = failedRequests.filter(
    req => !(req.url.endsWith('/me') && req.status === 401)
  );

  expect(unexpectedFailedRequests).toHaveLength(0);
  const unexpectedConsoleErrors = consoleErrors.filter(
    error => error !== 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  );
  
  expect(unexpectedConsoleErrors).toHaveLength(0);
});