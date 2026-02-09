import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';
const INVITATION_CODE = process.env.INVITATION_CODE ?? 'local-invitation-code';

// make user
function makeTestUser() {
  return {
    username: `pw_login_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    password: 'pw-test-password-1234',
  };
}

// register user
async function registerUser(request: APIRequestContext, username: string, password: string) {
  // retry once in case username already exists
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await request.post(`${BACKEND_URL}/register`, {
      data: { username, password, invitation_code: INVITATION_CODE },
    });

    if (res.ok()) return username;

    if (res.status() === 400 && attempt === 0) {
      username = `${username}_${Math.floor(Math.random() * 1e6)}`;
      continue;
    }

    const body = await res.text();
    throw new Error(`Failed to register test user: ${res.status()} ${body}`);
  }

  return username;
}

// creates a unique user and registers it via the backend
async function createAndRegisterTestUser(request: APIRequestContext) {
  const { username, password } = makeTestUser();
  const registeredUsername = await registerUser(request, username, password);
  return { username: registeredUsername, password };
}

// login
async function loginViaUI(page: Page, username: string, password: string) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
}

//tests
test('login view has needed objects visible', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.getByRole('link', { name: 'Login' }).click();
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register' })).toBeVisible();
});

test('login text boxes can be filled', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.getByRole('link', { name: 'Login' }).click();

  await expect(page.getByRole('textbox', { name: 'Username' })).toBeEmpty();
  await page.getByRole('textbox', { name: 'Username' }).fill('user123');
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue('user123');

  await expect(page.getByRole('textbox', { name: 'Password' })).toBeEmpty();
  await page.getByRole('textbox', { name: 'Password' }).fill('1234');
  await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('1234');
});

test('logging in makes protected content available', async ({ page, request }) => {
  const { username, password } = await createAndRegisterTestUser(request);

  await page.goto(FRONTEND_URL);
  await expect(page.getByText('You must be logged in to generate images.')).toBeVisible();
  await loginViaUI(page, username, password);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  await expect(page.getByText('You must be logged in to generate images.')).toBeHidden();
  await expect(page.getByText('Select playground component')).toBeVisible();
});

test('login persists after reload (token stored in localStorage)', async ({ page, request }) => {
  const { username, password } = await createAndRegisterTestUser(request);

  await page.goto(FRONTEND_URL);
  await loginViaUI(page, username, password);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
  const tokenAfterReload = await page.evaluate(() => localStorage.getItem('token'));
  expect(tokenAfterReload).toBeTruthy();
  await expect(page.getByText('Select playground component')).toBeVisible();
});

test('shows error on invalid credentials (alert dialog)', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.getByRole('link', { name: 'Login' }).click();

  const dialogPromise = page.waitForEvent('dialog');

  await page.getByTestId('login-username').fill('nonexistent-user');
  await page.getByTestId('login-password').fill('wrong-password');
  await page.getByRole('button', { name: 'Login' }).click();

  const dialog = await dialogPromise;

  expect(dialog.message()).toBe('Invalid username or password');
  await dialog.dismiss();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});

test('logout clears auth and protected content requires login again', async ({ page, request }) => {
  const { username, password } = await createAndRegisterTestUser(request);

  await page.goto(FRONTEND_URL);
  await loginViaUI(page, username, password);
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
  expect(tokenAfter).toBeFalsy();
  await page.goto(FRONTEND_URL);
  await expect(page.getByText('You must be logged in to generate images.')).toBeVisible();
});
