import { test, expect } from '@playwright/test';

test('main page visible objects, buttons and texts', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.getByText('You must be logged in to')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Image Generator' })).toBeVisible();
});

test('main page link takes to main page', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('link', { name: 'Image Generator' }).click();
  await expect(page.getByText('You must be logged in to')).toBeVisible();
});