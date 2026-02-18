import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';
const INVITATION_CODE = process.env.INVITATION_CODE ?? 'local-invitation-code';
const STORAGE_STATE_PATH = 'playwright/.auth/user.json';

// Create test user
function makeTestUser() {
  return {
    username: `pw_auth_${Date.now()}`,
    password: 'pw-test-password-1234',
  };
}

// Setup test
test('authenticate and save storage state', async ({ page, request }) => {
  const { username, password } = makeTestUser();

  const res = await request.post(`${BACKEND_URL}/register`, {
    data: { username, password, invitation_code: INVITATION_CODE },
  });

  expect(res.ok()).toBeTruthy();

  await page.goto(FRONTEND_URL);
  await page.getByRole('button', { name: 'Login' }).click();
  const dialog = page.getByRole('dialog', { name: 'Login' });

  await dialog.getByTestId('login-username').fill(username);
  await dialog.getByTestId('login-password').fill(password);
  await dialog.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('button', { name: 'Logout' }).waitFor({ state: 'visible' });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});


