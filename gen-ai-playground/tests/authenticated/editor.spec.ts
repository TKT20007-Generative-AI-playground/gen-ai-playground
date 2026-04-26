import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const PLAYGROUND_URL = new URL('playground/ImageEditor', FRONTEND_URL).toString();

// Dummy image
function getDummyImageBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test.describe("Image Editor flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/images/edit-image", async (route) => {
      const dummyImage = getDummyImageBuffer();
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: dummyImage,
      });
    });

    await page.goto(PLAYGROUND_URL);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  // Helpers
  async function uploadImage(page: Page) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /upload image/i }).click(),
    ]);

    await fileChooser.setFiles({
      name: "dummy.png",
      mimeType: "image/png",
      buffer: getDummyImageBuffer(),
    });
  }

  async function selectModel(page: Page, modelLabel: string) {
    const modelInput = page.getByRole("textbox", { name: "Model" });
    await modelInput.click();
    await modelInput.fill(modelLabel);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(modelInput).toHaveValue(modelLabel);
  }

  // Tests
  test("can edit an image successfully", async ({ page }) => {
    await selectModel(page, "FLUX.2 [klein] 9B");
    await uploadImage(page);

    const promptInput = page.getByTestId("prompt-input");
    await promptInput.fill("Add a sunny sky and mountains");

    await page.getByRole("button", { name: "Edit image" }).click();

    await expect(page.getByAltText("Edited result")).toBeVisible();
    await expect(page.getByAltText("Original")).toBeVisible();
  });

  test("shows alert if model, image, or prompt missing", async ({ page }) => {
    await page.evaluate(() => {
      (window as any)._lastAlert = null;
      window.alert = (msg) => ((window as any)._lastAlert = msg);
    });

    await page.getByRole("button", { name: "Edit image" }).click();

    const alertMessage = await page.evaluate(() => (window as any)._lastAlert);
    await expect(page.getByText("Please provide an image, a prompt, and select a model")).toBeVisible();

    await expect(page.getByAltText("Edited result")).toHaveCount(0);
  });

  test('shows and clears editing timer while request is in-flight', async ({ page }) => {
    const responseGate = createDeferred();

    await page.unroute('**/images/edit-image');
    await page.route('**/images/edit-image', async (route) => {
      await responseGate.promise;
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: getDummyImageBuffer(),
      });
    });

    await selectModel(page, 'FLUX.2 [klein] 9B');
    await uploadImage(page);

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Turn this into a watercolor painting');
    await page.getByRole('button', { name: 'Edit image' }).click();

    const statusText = page.getByText('Editing', { exact: true });
    await expect(statusText).toBeVisible();
    await expect(page.getByText(/\d+\.\ds/).first()).toBeVisible();

    responseGate.resolve();

    await expect(page.getByAltText('Edited result')).toBeVisible();
    await expect(statusText).toHaveCount(0);
  });

  test('shows generation time label from response header', async ({ page }) => {
    await page.unroute('**/images/edit-image');
    await page.route('**/images/edit-image', async (route) => {
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

    await selectModel(page, 'FLUX.2 [klein] 9B');
    await uploadImage(page);

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Show edit generation time label');
    await page.getByRole('button', { name: 'Edit image' }).click();

    await expect(page.getByAltText('Edited result')).toBeVisible();
    await expect(page.getByText('Generation time: 2.50s')).toBeVisible();
  });

  test('sends correct payload and calls edit endpoint once', async ({ page }) => {
    let callCount = 0;
    const seen: Array<{ image?: string; prompt?: string; model?: string }> = [];

    await page.unroute('**/images/edit-image');
    await page.route('**/images/edit-image', async (route) => {
      callCount += 1;
      seen.push(route.request().postDataJSON() as { image?: string; prompt?: string; model?: string });
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: getDummyImageBuffer(),
      });
    });

    await selectModel(page, 'FLUX.2 [klein] 9B');
    await uploadImage(page);

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Payload assertion edit prompt');
    await page.getByRole('button', { name: 'Edit image' }).click();

    await expect(page.getByAltText('Edited result')).toBeVisible();
    expect(callCount).toBe(1);
    expect(seen[0].prompt).toBe('Payload assertion edit prompt');
    expect(seen[0].model).toBe('FLUX2_KLEIN_9B');
    expect(seen[0].image).toMatch(/^data:image\//);
  });

  test('shows an error when image editing request fails', async ({ page }) => {
    await page.unroute('**/images/edit-image');
    await page.route('**/images/edit-image', async (route) => {
      await route.abort('failed');
    });

    await selectModel(page, 'FLUX.2 [klein] 9B');
    await uploadImage(page);

    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill('Failure path edit prompt');
    await page.getByRole('button', { name: 'Edit image' }).click();

    await expect(page.getByText('Image editing failed').first()).toBeVisible();
    await expect(page.getByAltText('Edited result')).toHaveCount(0);
  });
});
