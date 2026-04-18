import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const TRANSCRIBE_URL = new URL('playground/Transcribe', FRONTEND_URL).toString();

test.use({ storageState: 'playwright/.auth/user.json' });

type ModelStatus = 'live' | 'starting' | 'offline' | 'unknown';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function getDummyAudioBuffer() {
  return Buffer.from('RIFF....WAVEfmt ', 'utf-8');
}

async function openTranscribe(page: Page) {
  await page.goto(TRANSCRIBE_URL);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

async function uploadAudioFile(page: Page, fileName = 'sample.wav') {
  await page.locator('input[type="file"]').first().setInputFiles({
    name: fileName,
    mimeType: 'audio/wav',
    buffer: getDummyAudioBuffer(),
  });
}

async function selectAudioModel(page: Page, modelLabel: string) {
  const modelInput = page.locator('input[data-type="visible"][aria-haspopup="listbox"]').first();
  await modelInput.click();

  const option = page.locator('div[role="option"][data-combobox-option="true"]', {
    hasText: modelLabel,
  }).first();
  await option.click();
  await page.keyboard.press('Escape');
}

async function setupAudioRoutes(page: Page, statuses?: Record<string, ModelStatus>) {
  await page.route('**/audio/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available_models: [
          { value: 'model-a', label: 'Whisper A' },
          { value: 'model-b', label: 'Whisper B' },
          { value: 'model-c', label: 'Whisper C' },
          { value: 'model-d', label: 'Whisper D' },
          { value: 'model-e', label: 'Whisper E' },
        ],
      }),
    });
  });

  await page.route('**/audio/model-statuses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        statuses ?? {
          'model-a': 'live',
          'model-b': 'live',
          'model-c': 'live',
          'model-d': 'live',
          'model-e': 'live',
        },
      ),
    });
  });
}

test.describe('Transcribe flows', () => {
  test('shows no transcribe panels before selecting models', async ({ page }) => {
    await setupAudioRoutes(page);
    await openTranscribe(page);

    await expect(page.getByRole('button', { name: 'Transcribe uploaded file' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Transcribe recording' })).toHaveCount(0);
    await expect(page.getByText('Run transcription to see the model\'s output.')).toHaveCount(0);
  });

  test('does not allow selecting more than four models', async ({ page }) => {
    await setupAudioRoutes(page);
    await openTranscribe(page);

    const modelInput = page.locator('input[data-type="visible"][aria-haspopup="listbox"]');

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Whisper A' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Whisper B' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Whisper C' }).first().click();
    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Whisper D' }).first().click();

    await expect(page.getByText('Run transcription to see the model\'s output.')).toHaveCount(4);

    await modelInput.click();
    await page.locator('div[role="option"][data-combobox-option="true"]', { hasText: 'Whisper E' }).first().click();

    await expect(page.getByText('Run transcription to see the model\'s output.')).toHaveCount(4);
  });

  test('keeps offline models unselectable and shows status guidance after selecting a live model', async ({ page }) => {
    await setupAudioRoutes(page, {
      'model-a': 'live',
      'model-b': 'offline',
      'model-c': 'starting',
      'model-d': 'unknown',
      'model-e': 'offline',
    });
    await openTranscribe(page);

    await selectAudioModel(page, 'Whisper B');
    await expect(page.getByRole('button', { name: 'Transcribe uploaded file' })).toHaveCount(0);

    await selectAudioModel(page, 'Whisper A');
    await expect(page.getByRole('button', { name: 'Transcribe uploaded file' })).toBeVisible();
    await expect(page.getByText('Run transcription to see the model\'s output.')).toHaveCount(1);
  });

  test('sends upload transcription requests per selected model and renders results', async ({ page }) => {
    await setupAudioRoutes(page);
    await openTranscribe(page);

    let callCount = 0;
    await page.route('**/audio/transcribe', async (route) => {
      callCount += 1;
      const raw = route.request().postData() ?? '';
      const modelMatch = raw.match(/name="model_path"\r\n\r\n([^\r\n]+)/);
      const modelPath = modelMatch?.[1] ?? 'unknown';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: `${modelPath} transcript`,
          language: 'en',
          model: modelPath === 'model-a' ? 'small' : 'medium',
          transcription_time_ms: 1234,
        }),
      });
    });

    await selectAudioModel(page, 'Whisper A');
    await selectAudioModel(page, 'Whisper B');
    await uploadAudioFile(page);

    await page.getByRole('button', { name: 'Transcribe uploaded file' }).click();

    await expect(page.getByText('Model: Whisper Small')).toBeVisible();
    await expect(page.getByText('Model: Whisper Medium')).toBeVisible();
    await expect(page.getByText('Language: en')).toHaveCount(2);
    await expect(page.getByText('Transcription time: 1.23s')).toHaveCount(2);
    expect(callCount).toBe(2);
  });

  test('sends expected multipart contract fields and does not send task', async ({ page }) => {
    await setupAudioRoutes(page);
    await openTranscribe(page);

    let payload = '';
    await page.route('**/audio/transcribe', async (route) => {
      payload = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'ok',
          language: 'en',
          model: 'small',
          transcription_time_ms: 1000,
        }),
      });
    });

    await selectAudioModel(page, 'Whisper A');
    await uploadAudioFile(page);
    await page.getByRole('button', { name: 'Transcribe uploaded file' }).click();

    await expect(page.getByText('Model: Whisper Small')).toBeVisible();
    expect(payload).toContain('name="model_path"');
    expect(payload).toContain('model-a');
    expect(payload).toContain('name="source"');
    expect(payload).toContain('uploaded');
    expect(payload).toContain('name="run_id"');
    expect(payload).not.toContain('name="task"');
  });

  test('shows loading state in-flight and per-model error on failure', async ({ page }) => {
    await setupAudioRoutes(page);
    await openTranscribe(page);

    const responseGate = createDeferred();
    await page.route('**/audio/transcribe', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Transcribe failed upstream' }),
      });
    });

    await selectAudioModel(page, 'Whisper A');
    await uploadAudioFile(page);

    await page.getByRole('button', { name: 'Transcribe uploaded file' }).click();

    await expect(page.getByText('Transcribing...')).toBeVisible();

    responseGate.resolve();

    await expect(page.getByText('Transcribe failed upstream')).toBeVisible();
    await expect(page.getByText('Transcribing...')).toHaveCount(0);
  });
});
