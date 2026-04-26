import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173/";
const HISTORY_URL = new URL("history", FRONTEND_URL).toString();
const PLAYGROUND_URL = new URL("playground/ImageGenerator", FRONTEND_URL).toString();

const DUMMY_BASE64_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";


type HistoryTab = "Images" | "Text" | "Conversations" | "Transcribe";

type HistoryPageMocks = {
  imagesLength?: number;
  textLength?: number;
  audioLength?: number;
  conversationsLength?: number;
  imagesByPage?: Record<string, { history: any[]; total_pages: number }>;
  textByPage?: Record<string, { history: any[]; total_pages: number }>;
  audioByPage?: Record<string, { history: any[]; total_pages: number }>;
  conversationsByPage?: Record<string, { conversations: any[]; total_pages: number }>;
};

async function openHistorySidebar(page: Page) {
  let toggleSidebarButton = page.locator('button[aria-label="Toggle history sidebar"]');

  if (await toggleSidebarButton.count() === 0) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    toggleSidebarButton = page.locator('button[aria-label="Toggle history sidebar"]');
  }

  await expect(toggleSidebarButton).toBeVisible({ timeout: 15000 });
  await toggleSidebarButton.click();
  await expect(page.getByRole("textbox", { name: "Type:" })).toBeVisible();
}

async function selectHistoryType(page: Page, label: "Generated images" | "Generated text" | "Shared conversations" | "Transcriptions") {
  await page.getByRole("textbox", { name: "Type:" }).click();
  await page.getByRole("option", { name: label }).click();
}

async function selectHistoryTab(page: Page, tab: HistoryTab) {
  await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
}

async function mockHistoryPageEndpoints(page: Page, config: HistoryPageMocks = {}) {
  const {
    imagesLength = 1,
    textLength = 0,
    audioLength = 0,
    conversationsLength = 0,
    imagesByPage = {
      "1": {
        history: [
          {
            id: "img-1",
            prompt: "Aurora over snowy mountains",
            model: "FLUX.2 [klein] 9B",
            timestamp: new Date().toISOString(),
            image_data: DUMMY_BASE64_IMAGE,
            image_type: "generated",
          },
        ],
        total_pages: 1,
      },
    },
    textByPage = { "1": { history: [], total_pages: 1 } },
    audioByPage = { "1": { history: [], total_pages: 1 } },
    conversationsByPage = { "1": { conversations: [], total_pages: 1 } },
  } = config;

  await page.route("**/images/history-length*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ length: imagesLength }),
    });
  });

  await page.route("**/text/chat-messages-length*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ length: textLength }),
    });
  });

  await page.route("**/text/conversations-length*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ length: conversationsLength }),
    });
  });

  await page.route(/\/images\/history(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const pageParam = url.searchParams.get("page") ?? "1";
    const payload = imagesByPage[pageParam] ?? { history: [], total_pages: 1 };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route(/\/text\/history(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const pageParam = url.searchParams.get("page") ?? "1";
    const payload = textByPage[pageParam] ?? { history: [], total_pages: 1 };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route(/\/audio\/history(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const pageParam = url.searchParams.get("page") ?? "1";
    const payload = audioByPage[pageParam] ?? { history: [], total_pages: 1 };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...payload, total: audioLength }),
    });
  });

  await page.route(/\/text\/all-conversations(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const pageParam = url.searchParams.get("page") ?? "1";
    const payload = conversationsByPage[pageParam] ?? { conversations: [], total_pages: 1 };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}



test.describe("History sidebar flows", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

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

    await page.goto(PLAYGROUND_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  test("shows image history item in sidebar", async ({ page }) => {
    await openHistorySidebar(page);

    await expect(page.getByText("Futuristic cityscape")).toBeVisible();
    await expect(page.getByText("FLUX.2 [klein] 9B").first()).toBeVisible();
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

test.describe("History page flows", () => {
  test("shows grouped image history on the Images tab", async ({ page }) => {
    await mockHistoryPageEndpoints(page, {
      imagesLength: 2,
      imagesByPage: {
        "1": {
          history: [
            {
              id: "img-1",
              prompt: "Futuristic city skyline",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
            {
              id: "img-2",
              prompt: "Futuristic city skyline",
              model: "FLUX.1 Krea [dev]",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 1,
        },
      },
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await expect(page.getByTestId("prompt-futuristic city skyline")).toBeVisible();
    await expect(page.getByText("2 images")).toBeVisible();
  });

  test("switches tabs and shows empty states for each content type", async ({ page }) => {
    await mockHistoryPageEndpoints(page, {
      imagesLength: 1,
      textLength: 0,
      audioLength: 0,
      conversationsLength: 0,
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await selectHistoryTab(page, "Text");
    await expect(page.getByText("No text history yet. Start a conversation to see responses here.")).toBeVisible();

    await selectHistoryTab(page, "Transcribe");
    await expect(page.getByText("No transcription history yet. Run transcription to see outputs here.")).toBeVisible();

    await selectHistoryTab(page, "Conversations");
    await expect(
      page.getByText("No shared conversation history yet. Start a shared conversation to see responses here."),
    ).toBeVisible();
  });

  test("requests next page when pagination moves to page 2", async ({ page }) => {
    const imageHistoryPagesRequested: string[] = [];

    await mockHistoryPageEndpoints(page, {
      imagesLength: 2,
      imagesByPage: {
        "1": {
          history: [
            {
              id: "img-page-1",
              prompt: "Page one prompt",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 2,
        },
        "2": {
          history: [
            {
              id: "img-page-2",
              prompt: "Page two prompt",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 2,
        },
      },
    });

    await page.route(/\/images\/history(?:\?.*)?$/, async route => {
      const url = new URL(route.request().url());
      const pageParam = url.searchParams.get("page") ?? "1";
      imageHistoryPagesRequested.push(pageParam);

      const payload = pageParam === "2"
        ? {
          history: [
            {
              id: "img-page-2",
              prompt: "Page two prompt",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 2,
        }
        : {
          history: [
            {
              id: "img-page-1",
              prompt: "Page one prompt",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 2,
        };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await expect(page.getByTestId("prompt-page one prompt")).toBeVisible();
    await page.getByRole("button", { name: "2", exact: true }).click();

    await expect(page.getByTestId("prompt-page two prompt")).toBeVisible();
    expect(imageHistoryPagesRequested).toContain("2");
  });

  test("opens image modal and navigates to editor from Edit in Playground", async ({ page }) => {
    await mockHistoryPageEndpoints(page, {
      imagesByPage: {
        "1": {
          history: [
            {
              id: "img-edit-target",
              prompt: "Edit target image",
              model: "FLUX.2 [klein] 9B",
              timestamp: new Date().toISOString(),
              image_data: DUMMY_BASE64_IMAGE,
              image_type: "generated",
            },
          ],
          total_pages: 1,
        },
      },
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await page.getByAltText("Edit target image").click();
    await expect(page.getByTestId("modal-image")).toBeVisible();

    await page.getByRole("button", { name: "Edit in Playground" }).click();
    await expect(page).toHaveURL(/\/playground\/ImageEditor$/);
  });

  test("shows count badges on tabs from mocked history totals", async ({ page }) => {
    await mockHistoryPageEndpoints(page, {
      imagesLength: 5,
      textLength: 3,
      audioLength: 2,
      conversationsLength: 4,
      imagesByPage: { "1": { history: [], total_pages: 1 } },
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await expect(page.getByRole("tab", { name: /Images/i })).toContainText("5");
    await expect(page.getByRole("tab", { name: /Text/i })).toContainText("3");
    await expect(page.getByRole("tab", { name: /Conversations/i })).toContainText("4");
    await expect(page.getByRole("tab", { name: /Transcribe/i })).toContainText("2");
  });

  test("expands and collapses conversation messages", async ({ page }) => {
    await mockHistoryPageEndpoints(page, {
      imagesLength: 0,
      conversationsLength: 1,
      imagesByPage: { "1": { history: [], total_pages: 1 } },
      conversationsByPage: {
        "1": {
          conversations: [
            {
              _id: "conv-1",
              title: "Test Conversation",
              model: "deepseek-1",
              created_at: new Date().toISOString(),
              messages: [
                { role: "user", content: "tests are important", sender: "michael jordan" },
                { role: "assistant", content: "Yes you are right", sender: "assistant" },
                { role: "user", content: "Thanks for the feedback", sender: "michael jordan" },
              ],
            },
          ],
          total_pages: 1,
        },
      },
    });

    await page.goto(HISTORY_URL);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await selectHistoryTab(page, "Conversations");

    await expect(page.getByText("Test Conversation")).toBeVisible();
    await expect(page.getByRole("button", { name: "View all 3 messages" })).toBeVisible();

    await page.getByRole("button", { name: "View all 3 messages" }).click();
    await expect(page.getByText("Yes you are right")).toBeVisible();

    await page.getByRole("button", { name: "Show less" }).click();
    await expect(page.getByText("Yes you are right")).toHaveCount(0);
  });
});
