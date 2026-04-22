import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const TEXT_GENERATOR_URL = new URL('playground/TextGenerator', FRONTEND_URL).toString();

test.use({ storageState: 'playwright/.auth/user.json' });

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function openTextGenerator(page: Page) {
  await page.goto(TEXT_GENERATOR_URL);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

async function selectTextModel(page: Page, modelLabel: string) {
  const modelInput = page.getByPlaceholder('Select models');
  await modelInput.click();

  const option = page.locator('div[role="option"][data-combobox-option="true"]', {
    hasText: modelLabel,
  }).first();
  await option.click();
}

async function setupTextRoutes(page: Page) {
  await page.route('**/text/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available_models: [
          { value: 'model-a', label: 'Model A' },
          { value: 'model-b', label: 'Model B' },
          { value: 'model-c', label: 'Model C' },
          { value: 'model-d', label: 'Model D' },
          { value: 'model-e', label: 'Model E' },
        ],
      }),
    });
  });

  await page.route('**/text/model-statuses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'model-a': 'live',
        'model-b': 'live',
        'model-c': 'live',
        'model-d': 'live',
        'model-e': 'live',
      }),
    });
  });
}

test.describe('Text Generator flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupTextRoutes(page);
    await openTextGenerator(page);
  });

  test('shows and clears generating timer while text request is in-flight', async ({ page }) => {
    const responseGate = createDeferred();

    await page.route('**/text/chat', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Timer test response',
          generation_time_ms: 1234,
        }),
      });
    });

    await selectTextModel(page, 'Model A');

    const promptInput = page.getByPlaceholder('Type your message to send to selected models...');
    await promptInput.fill('Tell me a short fact');
    await page.getByRole('button', { name: 'Send' }).click();

    const generating = page.getByText('Generating', { exact: true });
    await expect(generating).toBeVisible();
    await expect(page.getByText(/\d+\.\ds/).first()).toBeVisible();

    responseGate.resolve();

    await expect(page.getByText('Timer test response')).toBeVisible();
    await expect(page.getByText('Response time: 1.23s')).toBeVisible();
    await expect(generating).toHaveCount(0);
  });

  test('clears generating timer and shows failure message on chat error', async ({ page }) => {
    const responseGate = createDeferred();

    await page.route('**/text/chat', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Upstream failed' }),
      });
    });

    await selectTextModel(page, 'Model A');

    const promptInput = page.getByPlaceholder('Type your message to send to selected models...');
    await promptInput.fill('Trigger an error path');
    await page.getByRole('button', { name: 'Send' }).click();

    const generating = page.getByText('Generating', { exact: true });
    await expect(generating).toBeVisible();

    responseGate.resolve();

    await expect(page.getByText('Failed to generate a response.')).toBeVisible();
    await expect(generating).toHaveCount(0);
  });

  test('shows no chat boxes before selecting models', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Type your message to send to selected models...')).toHaveCount(0);
    await expect(page.getByText('No messages yet.')).toHaveCount(0);
  });

  test('renders up to four chat boxes based on selected models', async ({ page }) => {
    const modelInput = page.locator('input[data-type="visible"][aria-haspopup="listbox"]');

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model A' }).first().click();
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(1);

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model B' }).first().click();
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(2);

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model C' }).first().click();
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(3);

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model D' }).first().click();
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(4);

    await expect(page.getByText('No messages yet.')).toHaveCount(4);
    await expect(page.getByPlaceholder('Type your message to send to selected models...')).toBeVisible();
  });

  test('does not allow selecting more than four models', async ({ page }) => {
    const modelInput = page.locator('input[data-type="visible"][aria-haspopup="listbox"]');

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model A' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model B' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model C' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model D' }).first().click();

    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(4);

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model E' }).first().click();

    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(4);
    await expect(page.getByText('No messages yet.')).toHaveCount(4);
  });

  test('hides chat boxes again after removing all selected models', async ({ page }) => {
    const modelInput = page.locator('input[data-type="visible"][aria-haspopup="listbox"]');

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model A' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model B' }).first().click();

    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(2);
    await expect(page.getByPlaceholder('Type your message to send to selected models...')).toBeVisible();

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model A' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Model B' }).first().click();

    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Type your message to send to selected models...')).toHaveCount(0);
    await expect(page.getByText('No messages yet.')).toHaveCount(0);
  });

  test('sends correct chat payload and calls endpoint once for one selected model', async ({ page }) => {
    let callCount = 0;
    const seenBodies: Array<{
      model_path?: string;
      messages?: Array<{ role?: string; content?: string }>;
    }> = [];

    await page.route('**/text/chat', async (route) => {
      callCount += 1;
      seenBodies.push(route.request().postDataJSON() as {
        model_path?: string;
        messages?: Array<{ role?: string; content?: string }>;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Contract check reply',
          generation_time_ms: 1111,
        }),
      });
    });

    await selectTextModel(page, 'Model A');
    await page.getByPlaceholder('Type your message to send to selected models...').fill('Contract payload prompt');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Contract check reply')).toBeVisible();
    expect(callCount).toBe(1);
    expect(seenBodies[0].model_path).toBe('model-a');
    expect(seenBodies[0].messages).toEqual([
      { role: 'user', content: 'Contract payload prompt' },
    ]);
  });
});
