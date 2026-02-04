import { test, expect } from '@playwright/test';

test('test main page visibility', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.getByRole('link', { name: 'Image Generator' })).toBeVisible();
  await expect(page.getByText('Flux Kontext')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Prompt here' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create image' })).toBeVisible();
});

test('test text box writing and visibility', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('textbox', { name: 'Prompt here' }).click();
  await page.getByRole('textbox', { name: 'Prompt here' }).fill('cat in a spacesuit');
  await expect(page.getByText('prompt: cat in a spacesuit')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Prompt here' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Prompt here' })).toHaveValue('cat in a spacesuit');
});

test('test page has no console errors on load', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  expect(consoleErrors).toHaveLength(0);

})