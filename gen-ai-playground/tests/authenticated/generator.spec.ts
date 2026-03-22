import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const PLAYGROUND_URL = `${FRONTEND_URL}playground`;

test.use({ storageState: 'playwright/.auth/user.json' });

// Helper functions for test flows
async function selectModels(page: Page, model1?: string, model2?: string) {
  if (model1) {
    await page.goto(PLAYGROUND_URL);
    await page.getByTestId('model-1-selector').click();

    const option1 = page.locator('div[role="option"][data-combobox-option="true"]', { hasText: model1 }).first();
    await option1.click();
  }

  if (model2) {
    await page.getByTestId('model-2-selector').click();

    const option2 = page
      .locator('div[role="option"][data-combobox-option="true"]', { hasText: model2 })
      .filter({ hasText: model2, visible: true });
    await option2.click();
  }
}

async function enterPromptAndGenerate(page: Page, prompt: string) {
  const promptInput = page.getByTestId('prompt-input');
  await promptInput.fill(prompt);
  const createBtn = page.getByRole('button', { name: 'Create image' });
  await createBtn.click();
}

async function expectImagesVisible(page: Page, expectFirst = true, expectSecond = false) {
  if (expectFirst) {
    await expect(page.getByAltText('Generated image 1')).toBeVisible();
  } else {
    await expect(page.getByAltText('Generated image 1')).toHaveCount(0);
  }

  if (expectSecond) {
    await expect(page.getByAltText('Generated image 2')).toBeVisible();
  } else {
    await expect(page.getByAltText('Generated image 2')).toHaveCount(0);
  }
}

// Helper to create a dummy image
function getDummyImageBuffer() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

// Main test suite for generator page flows
test.describe('Generator page flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/images/generate', async (route) => {
      const dummyImage = getDummyImageBuffer();
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: dummyImage,
      });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

  });

  // Tests
  test('generate image with Model 1 only', async ({ page }) => {
    await selectModels(page, 'FLUX.2 [klein] 9B');
    await enterPromptAndGenerate(page, 'A futuristic cityscape at sunset');
    await expectImagesVisible(page, true, false);
  });

  test('generate images with both models', async ({ page }) => {
    await selectModels(
        page,
        'FLUX.2 [klein] 9B',
        'FLUX.1 Krea [dev]'
    );
    await enterPromptAndGenerate(page, 'A serene mountain lake at sunrise');
    await expectImagesVisible(page, true, true);
  });

  test('fails if no model selected', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    
    await page.evaluate(() => {
        (window as any)._lastAlert = null;
        window.alert = (msg) => ((window as any)._lastAlert = msg);
    });

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Test prompt without model');

    const createBtn = page.getByRole('button', { name: 'Create image' });
    await createBtn.click();

    const alertMessage = await page.evaluate(() => (window as any)._lastAlert);
    expect(alertMessage).toBe('Please select a model');

    await expect(page.getByTestId('generated-image-1')).toHaveCount(0);
    await expect(page.getByTestId('generated-image-2')).toHaveCount(0);
    });

});


