import { test, expect } from '@playwright/test';

test('register form shows correctly', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByTestId('register-username')).toBeVisible();
  await expect(page.getByTestId('register-password')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Confirm Password' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create user' })).toBeVisible();
});

test('register fields can be filled', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByTestId('register-username')).toBeEmpty();
  await expect(page.getByTestId('register-password')).toBeEmpty();
  await expect(page.getByRole('textbox', { name: 'Confirm Password' })).toBeEmpty();
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toBeEmpty();
  await page.getByTestId('register-username').click();
  await page.getByTestId('register-username').fill('user123');
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue('user123');
  await page.getByTestId('register-password').click();
  await page.getByTestId('register-password').fill('1234');
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveValue('1234');
  await page.getByRole('textbox', { name: 'Confirm Password' }).click();
  await page.getByRole('textbox', { name: 'Confirm Password' }).fill('1234');
  await expect(page.getByRole('textbox', { name: 'Confirm Password' })).toHaveValue('1234');
  await page.getByRole('textbox', { name: 'Invitation code' }).click();
  await page.getByRole('textbox', { name: 'Invitation code' }).fill('12345');
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toHaveValue('12345');
});