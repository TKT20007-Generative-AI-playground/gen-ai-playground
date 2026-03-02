import { test, expect } from '@playwright/test';
import {
  FRONTEND_URL,
  gotoHome,
  openLoginDialog,
  createAndRegisterUser,
  loginViaUI,
  expectLoggedIn,
  expectLoggedOut,
} from '../helpers/auth';


test('logging in makes protected content available', async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  await expect(page.getByText('You must be logged in to generate images.')).toBeVisible();
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  await expect(page.getByText('You must be logged in to generate images.')).toBeHidden();
  await expect(page.getByText('Select playground component')).toBeVisible();
});

test('login persists after reload', async ({ page }) => {
  const user = await createAndRegisterUser(page.request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  await expect(page.getByText('Select playground component')).toBeVisible();
  await page.reload();
  await expectLoggedIn(page);
  await expect(page.getByText('Select playground component')).toBeVisible();
});

test('shows error on invalid credentials (alert dialog)', async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  const loginDialog = await openLoginDialog(page);
  const dialogPromise = page.waitForEvent('dialog');
  await loginDialog.getByTestId('login-username').fill(user.username);
  await loginDialog.getByTestId('login-password').fill('wrong-password');
  await loginDialog.getByRole('button', { name: 'Login' }).click();
  const dialog = await dialogPromise;
  const msg = dialog.message();
  expect(msg.length).toBeGreaterThan(0);
  await dialog.dismiss();
  await expectLoggedOut(page);
  await expect(loginDialog).toBeVisible();
});

test('logout clears auth and protected content requires login again', async ({ page }) => {
  const user = await createAndRegisterUser(page.request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expectLoggedOut(page);
  await page.goto(`${FRONTEND_URL}/playground`);
  await expect(page).not.toHaveURL(/\/playground$/);
  await expect(page.getByText('You must be logged in to generate images.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('You must be logged in to generate images.')).toBeVisible();
});
