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

    await page.route('**/text/stream', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          'data: {"token": "Timer test response"}\n\n' +
          'data: [DONE]\n\n',
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
    // Generation time is now measured client-side, so we only assert the badge format.
    await expect(page.getByText(/Response time: \d/).first()).toBeVisible();
    await expect(generating).toHaveCount(0);
  });

  test.fixme('clears generating timer and shows failure message on chat error', async ({ page }) => {
    const responseGate = createDeferred();

    await page.route('**/text/stream', async (route) => {
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

    await expect(page.getByText('Failed to stream response.')).toBeVisible();
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

  test.fixme('sends correct stream payload and calls endpoint once for one selected model', async ({ page }) => {
    let callCount = 0;
    const seenBodies: Array<{
      deployment_name?: string;
      model_path?: string;
      messages?: Array<{ role?: string; content?: string }>;
    }> = [];

    await page.route('**/text/stream', async (route) => {
      callCount += 1;
      seenBodies.push(route.request().postDataJSON() as {
        deployment_name?: string;
        model_path?: string;
        messages?: Array<{ role?: string; content?: string }>;
      });

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          'data: {"token": "Contract check reply"}\n\n' +
          'data: [DONE]\n\n',
      });
    });

    await selectTextModel(page, 'Model A');
    await page.getByPlaceholder('Type your message to send to selected models...').fill('Contract payload prompt');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Contract check reply')).toBeVisible();
    expect(callCount).toBe(1);
    expect(seenBodies[0].deployment_name).toBe('model-a');
    // Frontend no longer sends model_path; the backend resolves it from
    // deployment_name via its template registry.
    expect(seenBodies[0].model_path).toBeUndefined();
    expect(seenBodies[0].messages).toEqual([
      { role: 'user', content: 'Contract payload prompt' },
    ]);
  });
});

test.describe('Text Generator streaming', () => {
  test.beforeEach(async ({ page }) => {
    await setupTextRoutes(page);
    await openTextGenerator(page);
  });

  test.fixme('streams tokens, renders progressively, and finalizes with a response time', async ({ page }) => {
    const seenBodies: Array<{
      messages?: Array<{ role?: string; content?: string }>;
      deployment_name?: string;
      model_path?: string;
      max_tokens?: number;
    }> = [];

    await page.route('**/text/stream', async (route) => {
      seenBodies.push(route.request().postDataJSON() as {
        messages?: Array<{ role?: string; content?: string }>;
        deployment_name?: string;
        model_path?: string;
        max_tokens?: number;
      });

      const sse =
        'data: {"token": "Hello"}\n\n' +
        'data: {"token": ", "}\n\n' +
        'data: {"token": "world"}\n\n' +
        'data: {"token": "!"}\n\n' +
        'data: [DONE]\n\n';

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse,
      });
    });

    await selectTextModel(page, 'Model A');

    const promptInput = page.getByPlaceholder('Type your message to send to selected models...');
    await promptInput.fill('Stream prompt');
    await page.getByRole('button', { name: 'Send' }).click();

    // The full assembled message appears once all token events have been processed.
    await expect(page.getByText('Hello, world!')).toBeVisible();

    // [DONE] triggers onDone, which clears isPending and sets generationTimeMs.
    await expect(page.getByText(/Response time: \d/).first()).toBeVisible();
    await expect(page.getByText('Generating', { exact: true })).toHaveCount(0);

    // Verify what the frontend actually sent upstream.
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0].deployment_name).toBe('model-a');
    // Frontend no longer sends model_path; the backend resolves it from
    // deployment_name via its template registry.
    expect(seenBodies[0].model_path).toBeUndefined();
    expect(seenBodies[0].messages).toEqual([
      { role: 'user', content: 'Stream prompt' },
    ]);
  });

  test.fixme('renders reasoning tokens inside the "Show reasoning" details', async ({ page }) => {
    await page.route('**/text/stream', async (route) => {
      const sse =
        'data: {"reasoning": "Thinking step 1. "}\n\n' +
        'data: {"reasoning": "Thinking step 2."}\n\n' +
        'data: {"token": "Final answer."}\n\n' +
        'data: [DONE]\n\n';

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse,
      });
    });

    await selectTextModel(page, 'Model A');
    await page.getByPlaceholder('Type your message to send to selected models...').fill('Show your reasoning');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Final answer.')).toBeVisible();

    // Reasoning lives behind a <summary> toggle; expand it before asserting.
    await page.getByText('Show reasoning').click();
    await expect(page.getByText('Thinking step 1. Thinking step 2.')).toBeVisible();
  });

  test.fixme('shows a failure message when the stream endpoint errors', async ({ page }) => {
    await page.route('**/text/stream', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Upstream stream failed' }),
      });
    });

    await selectTextModel(page, 'Model A');
    await page.getByPlaceholder('Type your message to send to selected models...').fill('Will fail');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Failed to stream response.')).toBeVisible();
    await expect(page.getByText('Generating', { exact: true })).toHaveCount(0);
  });
});
