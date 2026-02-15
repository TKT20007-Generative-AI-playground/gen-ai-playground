import { test, expect } from '@playwright/test';

test('login view has needed objects visible', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Login' }).click();
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register' })).toBeVisible();
});

test('login text boxes can be filled', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Login' }).click();
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeEmpty();
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('user123');
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue('user123');
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeEmpty();
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('1234');
  await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('1234');
});

