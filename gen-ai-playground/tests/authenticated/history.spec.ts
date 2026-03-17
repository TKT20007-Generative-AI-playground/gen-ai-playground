import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173/";

// Dummy history data
const dummyHistory = [
  {
    prompt: "Futuristic cityscape",
    images: [
      {
        prompt: "Futuristic cityscape",
        model: "FLUX.2 [klein] 9B",
        timestamp: new Date().toISOString(),
        image_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        image_type: "png",
      },
    ],
  },
  {
    prompt: "Serene mountain lake",
    images: [
      {
        prompt: "Serene mountain lake",
        model: "FLUX.1 Krea [dev]",
        timestamp: new Date().toISOString(),
        image_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        image_type: "png",
      },
      {
        prompt: "Serene mountain lake",
        model: "FLUX.2 [klein] 9B",
        timestamp: new Date().toISOString(),
        image_data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        image_type: "png",
      },
    ],
  },
];

// Helper function
async function openHistoryDrawer(page: Page) {
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
}

test.describe("History drawer flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/images/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: dummyHistory.flatMap((g) => g.images),
        }),
      });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  // Tests
  test("opens history drawer and displays grouped prompts", async ({
    page,
  }) => {
    await openHistoryDrawer(page);

    const drawer = page.getByRole("dialog", { name: "History" });
    await expect(drawer).toBeVisible();

    for (const group of dummyHistory) {
      await expect(drawer.getByTestId(`prompt-${group.prompt}`)).toBeVisible();

      for (const image of group.images) {
        const id = `-${image.prompt}-${image.model}`;
        await expect(drawer.getByTestId(`image${id}`)).toBeVisible();
        await expect(drawer.getByTestId(`model${id}`)).toBeVisible();
        await expect(drawer.getByTestId(`type${id}`)).toBeVisible();
        await expect(drawer.getByTestId(`timestamp${id}`)).toBeVisible();
      }
    }
  });

  test("opens image modal when clicking on an image", async ({ page }) => {
    await openHistoryDrawer(page);
    const firstImage = page.getByTestId(
      "image-Futuristic cityscape-FLUX.2 [klein] 9B",
    );
    await expect(firstImage).toBeVisible({ timeout: 5000 });

    await firstImage.click();

    const modalImg = page.getByTestId("modal-image");
    await expect(modalImg).toBeVisible({ timeout: 5000 });

    const src = await firstImage.getAttribute("src");
    expect(src).not.toBeNull();
    const base64 = src!.split(",")[1];
    await expect(modalImg).toHaveAttribute(
      "src",
      `data:image/png;base64,${base64}`,
    );
  });

  test("handles empty history gracefully", async ({ page }) => {
    await page.route("**/images/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [] }),
      });
    });

    await openHistoryDrawer(page);
    await expect(page.getByText("No history to show.")).toBeVisible();
  });

  test("shows loader while fetching history", async ({ page }) => {
    let resolveRoute: (value?: any) => void;
    const routePromise = new Promise((res) => (resolveRoute = res));

    await page.route("**/images/history", async (route) => {
      await routePromise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: dummyHistory.flatMap((g) => g.images),
        }),
      });
    });

    await page.getByRole("button", { name: "History" }).click();

    await expect(page.getByTestId("history-loader")).toBeVisible();

    resolveRoute!();
  });
});
