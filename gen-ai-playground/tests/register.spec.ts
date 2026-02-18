import { test, expect } from '@playwright/test';

// Disable storageState
test.use({ storageState: undefined });

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';

test('register form shows correctly', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.getByRole('button', { name: 'Login' }).click();
  const loginDialog = page.getByRole('dialog', { name: 'Login' });
  await expect(loginDialog).toBeVisible();
  await loginDialog.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByTestId('register-username')).toBeVisible();
  await expect(page.getByTestId('register-password')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Confirm password' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create user' })).toBeVisible();
});


test('register fields can be filled', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.getByRole('button', { name: 'Login' }).click();
  const loginDialog = page.getByRole('dialog', { name: 'Login' });
  await expect(loginDialog).toBeVisible();
  await loginDialog.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByTestId('register-username')).toBeEmpty();
  await expect(page.getByTestId('register-password')).toBeEmpty();
  await expect(page.getByRole('textbox', { name: 'Confirm password' })).toBeEmpty();
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toBeEmpty();
  await page.getByTestId('register-username').fill('user123');
  await expect(page.getByTestId('register-username')).toHaveValue('user123');
  await page.getByTestId('register-password').fill('1234');
  await expect(page.getByTestId('register-password')).toHaveValue('1234');
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('1234');
  await expect(page.getByRole('textbox', { name: 'Confirm password' })).toHaveValue('1234');
  await page.getByRole('textbox', { name: 'Invitation code' }).fill('12345');
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toHaveValue('12345');
});