import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const PLAYGROUND_URL = new URL('playground', FRONTEND_URL).toString();

test.use({ storageState: "playwright/.auth/user.json" });

// Helper functions for test flows
async function selectModels(page: Page, model1?: string, model2?: string) {
  if (model1) {
    await page.goto(PLAYGROUND_URL);
    await page.getByTestId('model-1-selector').click();

    const option1 = page
      .locator('div[role="option"][data-combobox-option="true"]', {
        hasText: model1,
      })
      .first();
    await option1.click();
  }

  if (model2) {
    await page.getByTestId("model-2-selector").click();

    const option2 = page
      .locator('div[role="option"][data-combobox-option="true"]', {
        hasText: model2,
      })
      .filter({ hasText: model2, visible: true });
    await option2.click();
  }
}

async function enterPromptAndGenerate(page: Page, prompt: string) {
  const promptInput = page.getByTestId("prompt-input");
  await promptInput.fill(prompt);
  const createBtn = page.getByRole("button", { name: "Create image" });
  await createBtn.click();
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function expectImagesVisible(page: Page, expectFirst = true, expectSecond = false) {
  if (expectFirst) {
    await expect(page.getByAltText("Generated image 1")).toBeVisible();
  } else {
    await expect(page.getByAltText("Generated image 1")).toHaveCount(0);
  }

  if (expectSecond) {
    await expect(page.getByAltText("Generated image 2")).toBeVisible();
  } else {
    await expect(page.getByAltText("Generated image 2")).toHaveCount(0);
  }
}

// Helper to create a dummy image
function getDummyImageBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
}

// Main test suite for generator page flows
test.describe("Generator page flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/images/generate", async (route) => {
      const dummyImage = getDummyImageBuffer();
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: dummyImage,
      });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  // Tests
  test("generate image with Model 1 only", async ({ page }) => {
    await selectModels(page, "FLUX.2 [klein] 9B");
    await enterPromptAndGenerate(page, "A futuristic cityscape at sunset");
    await expectImagesVisible(page, true, false);
  });

  test("generate images with both models", async ({ page }) => {
    await selectModels(page, "FLUX.2 [klein] 9B", "FLUX.1 Krea [dev]");
    await enterPromptAndGenerate(page, "A serene mountain lake at sunrise");
    await expectImagesVisible(page, true, true);
  });

  test('fails if no model selected', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    
    await page.evaluate(() => {
      (window as any)._lastAlert = null;
      window.alert = (msg) => ((window as any)._lastAlert = msg);
    });

    const promptInput = page.getByTestId("prompt-input");
    await promptInput.fill("Test prompt without model");

    const createBtn = page.getByRole("button", { name: "Create image" });
    await createBtn.click();

    await expect(page.getByText("Please select at least one model")).toBeVisible();

    await expectImagesVisible(page, false, false);
  });

  test('shows and clears generating timer while image request is in-flight', async ({ page }) => {
    const responseGate = createDeferred();

    await page.unroute('**/images/generate');
    await page.route('**/images/generate', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: getDummyImageBuffer(),
      });
    });

    await selectModels(page, 'FLUX.2 [klein] 9B');
    await enterPromptAndGenerate(page, 'A snowy mountain at blue hour');

    const status = page.locator('div', { hasText: 'Generating' }).first();
    await expect(status).toBeVisible();
    await expect(status).toContainText(/\d+\.\ds/);

    responseGate.resolve();

    await expect(page.getByAltText('Generated image 1')).toBeVisible();
    await expect(page.getByText('Generating')).toHaveCount(0);
  });

  test('shows generation time label from response header', async ({ page }) => {
    await page.unroute('**/images/generate');
    await page.route('**/images/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: {
          'x-generation-time-ms': '2500',
          'access-control-expose-headers': 'x-generation-time-ms',
        },
        body: getDummyImageBuffer(),
      });
    });

    await selectModels(page, 'FLUX.2 [klein] 9B');
    await enterPromptAndGenerate(page, 'Show generation time label');

    await expect(page.getByAltText('Generated image 1')).toBeVisible();
    await expect(page.getByText('Generation time: 2.50s')).toBeVisible();
  });

  test('sends correct payload and calls generate endpoint once for single model', async ({ page }) => {
    let callCount = 0;
    const seen: Array<{ prompt?: string; model?: string }> = [];

    await page.unroute('**/images/generate');
    await page.route('**/images/generate', async (route) => {
      callCount += 1;
      seen.push(route.request().postDataJSON() as { prompt?: string; model?: string });
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: getDummyImageBuffer(),
      });
    });

    await selectModels(page, 'FLUX.2 [klein] 9B');
    await enterPromptAndGenerate(page, 'Payload assertion prompt');

    await expect(page.getByAltText('Generated image 1')).toBeVisible();
    expect(callCount).toBe(1);
    expect(seen[0]).toMatchObject({
      prompt: 'Payload assertion prompt',
      model: 'FLUX2_KLEIN_9B',
    });
  });

  test('calls generate endpoint twice with both selected model payloads', async ({ page }) => {
    let callCount = 0;
    const modelsSent: string[] = [];

    await page.unroute('**/images/generate');
    await page.route('**/images/generate', async (route) => {
      callCount += 1;
      const body = route.request().postDataJSON() as { model?: string };
      if (body.model) modelsSent.push(body.model);
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: getDummyImageBuffer(),
      });
    });

    await selectModels(page, 'FLUX.2 [klein] 9B', 'FLUX.1 Krea [dev]');
    await enterPromptAndGenerate(page, 'Dual model request assertion');

    await expectImagesVisible(page, true, true);
    expect(callCount).toBe(2);
    expect(modelsSent.sort()).toEqual(['FLUX1_KREA_DEV', 'FLUX2_KLEIN_9B']);
  });

  test('shows an error when image generation request fails', async ({ page }) => {
    await page.unroute('**/images/generate');
    await page.route('**/images/generate', async (route) => {
      await route.abort('failed');
    });

    await selectModels(page, 'FLUX.2 [klein] 9B');
    await enterPromptAndGenerate(page, 'Failure path prompt');

    await expect(page.getByText('FLUX.2 [klein] 9B failed')).toBeVisible();
    await expect(page.getByAltText('Generated image 1')).toHaveCount(0);
  });
});
