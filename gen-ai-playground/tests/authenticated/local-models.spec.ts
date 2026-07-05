/// <reference types="node" />

import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const LOCAL_MODELS_URL = new URL('playground/LocalModels', FRONTEND_URL).toString();

test.use({ storageState: 'playwright/.auth/user.json' });

async function mockOllamaOnline(page: Page) {
  await page.route('**/api/tags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { name: 'llama3.2:3b', size: 2000000000, details: { parameter_size: '3.2B', quantization_level: 'Q4_K_M' } },
        ],
      }),
    });
  });
}

async function openLocalModels(page: Page) {
  await page.goto(LOCAL_MODELS_URL);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

test.describe('Local Models flows', () => {
  test('shows macOS onboarding when Ollama is unreachable', async ({ page }) => {
    // Simulate a connection failure / CORS block: the request never completes.
    await page.route('**/api/tags', (route) => route.abort());

    await openLocalModels(page);

    await expect(page.getByText('Run a model on your own machine')).toBeVisible();
    // OS-aware onboarding exposes a tab per platform.
    await expect(page.getByRole('tab', { name: 'macOS' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Windows' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Linux / WSL' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  });

  test('lists installed models and streams a chat reply', async ({ page }) => {
    await mockOllamaOnline(page);

    let chatPayload = '';
    await page.route('**/v1/chat/completions', async (route) => {
      chatPayload = route.request().postData() ?? '';
      // OpenAI-compatible SSE frames, ending with [DONE].
      const body =
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" there"}}]}\n\n' +
        'data: [DONE]\n\n';
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      });
    });

    await openLocalModels(page);

    await expect(page.getByText('Ollama connected')).toBeVisible();
    await expect(page.getByPlaceholder('Type your message…')).toBeVisible();

    await page.getByPlaceholder('Type your message…').fill('Hi');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Hello there')).toBeVisible();
    expect(chatPayload).toContain('"model":"llama3.2:3b"');
    expect(chatPayload).toContain('"stream":true');
  });
});
