import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';

// Dummy image
function getDummyImageBuffer() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

test.describe('Image Editor flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/images/edit-image', async (route) => {
      const dummyImage = getDummyImageBuffer();
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: dummyImage,
      });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    const playgroundSelector = page.getByTestId('playground-select');
    await playgroundSelector.click(); // opens dropdown
    await page.getByRole('option', { name: 'ImageEditor' }).click();
  });

  // Helpers
  async function uploadImage(page: Page) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload image/i }).click(),
    ]);

    await fileChooser.setFiles({
      name: 'dummy.png',
      mimeType: 'image/png',
      buffer: getDummyImageBuffer(),
    });
  }

  async function selectModel(page: Page, modelLabel: string) {
    const modelSelect = page.getByTestId('model-2-selector');
    await modelSelect.click();

    const option = page.locator('div[role="option"][data-combobox-option="true"]', { hasText: modelLabel }).first();
    await option.click();
  }

  // Tests
  test('can edit an image successfully', async ({ page }) => {
    await selectModel(page, 'FLUX.2 [klein] 9B');
    await uploadImage(page);

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Add a sunny sky and mountains');

    await page.getByRole('button', { name: 'Edit image' }).click();

    await expect(page.getByAltText('Edited result')).toBeVisible();
    await expect(page.getByAltText('Original')).toBeVisible();
  });

  test('shows alert if model, image, or prompt missing', async ({ page }) => {
    await page.evaluate(() => {
      (window as any)._lastAlert = null;
      window.alert = (msg) => ((window as any)._lastAlert = msg);
    });

    await page.getByRole('button', { name: 'Edit image' }).click();

    const alertMessage = await page.evaluate(() => (window as any)._lastAlert);
    expect(alertMessage).toBe('Please provide an image, a prompt, and select a model');

    await expect(page.getByAltText('Edited result')).toHaveCount(0);
  });
});
