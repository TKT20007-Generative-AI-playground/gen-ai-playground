import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173/";
const DUMMY_BASE64_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

async function openHistorySidebar(page: Page) {
  await page.getByRole("button", { name: "Toggle history sidebar" }).click();
  await expect(page.getByRole("textbox", { name: "Type:" })).toBeVisible();
}

async function selectHistoryType(page: Page, label: "Generated images" | "Generated text" | "Shared conversations" | "Transcriptions") {
  await page.getByRole("textbox", { name: "Type:" }).click();
  await page.getByRole("option", { name: label }).click();
}

test.describe("History sidebar flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/images/history-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              prompt: "Futuristic cityscape",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
        }),
      });
    });

    await page.route("**/text/history-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [] }),
      });
    });

    await page.route("**/text/shared-conversations-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [] }),
      });
    });

    await page.route("**/audio/history-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [] }),
      });
    });

    await page.goto(FRONTEND_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  test("shows image history item in sidebar", async ({ page }) => {
    await openHistorySidebar(page);

    await expect(page.getByText("Futuristic cityscape")).toBeVisible();
    await expect(page.getByText("FLUX.2 [klein] 9B")).toBeVisible();
    await expect(page.getByRole("button", { name: "View in History" })).toBeVisible();
  });

  test("keeps selectors usable when selected type is empty", async ({ page }) => {
    await page.route("**/images/history-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [] }),
      });
    });

    await page.route("**/audio/history-sidebar*", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              model: "openai/whisper-small",
              timestamp: new Date().toISOString(),
              transcription_text: "Daily standup notes",
              input_name: "meeting.wav",
              source: "uploaded",
              transcription_time_ms: 1234,
              type: "transcription",
            },
          ],
        }),
      });
    });

    await openHistorySidebar(page);
    await expect(page.getByText("No recent image history.")).toBeVisible();

    await selectHistoryType(page, "Transcriptions");

    await expect(page.getByRole("textbox", { name: "Type:" })).toBeVisible();
    await expect(page.getByText("meeting.wav")).toBeVisible();
    await expect(page.getByText("Daily standup notes")).toBeVisible();
  });
});
