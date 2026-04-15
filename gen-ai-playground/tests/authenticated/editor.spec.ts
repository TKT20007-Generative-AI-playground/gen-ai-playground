import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173/';
const PLAYGROUND_URL = new URL('playground/ImageEditor', FRONTEND_URL).toString();

// Dummy image
function getDummyImageBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
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
    expect(alertMessage).toBe(
      "Please provide an image, a prompt, and select a model",
    );

    await expect(page.getByAltText("Edited result")).toHaveCount(0);
  });
});
