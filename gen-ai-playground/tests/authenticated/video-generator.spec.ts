/// <reference types="node" />

import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const VIDEO_GENERATOR_URL = new URL('playground/VideoGenerator', FRONTEND_URL).toString();

test.use({ storageState: 'playwright/.auth/user.json' });

async function setupVideoRoutes(page: Page, statuses: Record<string, string> = { 'Wan2.1 T2V 1.3B': 'live' }) {
  await page.route('**/video/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available_models: [
          { value: 'Wan2.1 T2V 1.3B', label: 'Wan2.1 T2V 1.3B' },
          { value: 'Offline Video', label: 'Offline Video' },
        ],
      }),
    });
  });

  await page.route('**/video/model-statuses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(statuses),
    });
  });
}

async function openVideoGenerator(page: Page) {
  await page.goto(VIDEO_GENERATOR_URL);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

test.describe('Video Generator flows', () => {
  test('renders model controls and generates a video preview', async ({ page }) => {
    await setupVideoRoutes(page);
    let payload = '';
    await page.route('**/video/generate', async (route) => {
      payload = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          video_base64: Buffer.from('fake-mp4').toString('base64'),
          mime_type: 'video/mp4',
          model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers',
          generation_time_ms: 1234,
          num_frames: 49,
          fps: 16,
        }),
      });
    });

    await openVideoGenerator(page);

    await expect(page.getByText('Generate a short text-to-video clip')).toBeVisible();
    await page.getByLabel('Prompt', { exact: true }).fill('A calm lake at sunrise');
    await page.getByRole('button', { name: 'Generate video' }).click();

    await expect(page.locator('video')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    expect(payload).toContain('"prompt":"A calm lake at sunrise"');
    expect(payload).toContain('"model_path":"Wan2.1 T2V 1.3B"');
  });

  test('keeps offline models from generating', async ({ page }) => {
    await setupVideoRoutes(page, {
      'Wan2.1 T2V 1.3B': 'offline',
      'Offline Video': 'offline',
    });

    await openVideoGenerator(page);

    await page.getByLabel('Prompt', { exact: true }).fill('A calm lake at sunrise');
    await expect(page.getByRole('button', { name: 'Generate video' })).toBeDisabled();
  });
});
