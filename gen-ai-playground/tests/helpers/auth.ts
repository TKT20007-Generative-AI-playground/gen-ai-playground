import { expect, type APIRequestContext, type Page } from "@playwright/test";

/* Config */

export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export const INVITATION_CODE =
  process.env.INVITATION_CODE ?? "local-invitation-code";

/* Test user generation */

export type TestUser = {
  username: string;
  password: string;
};

function toAlphanumeric(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

function createUsername(prefix: string): string {
  const safePrefix = toAlphanumeric(prefix) || "pw";
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${safePrefix}${timestampPart}${randomPart}`;
}

export function createTestUser(prefix = "pw"): TestUser {
  return {
    username: createUsername(prefix),
    password: 'ValidPass1234!',
  };
}

export function createValidRegisterUser(prefix = "pwregister"): TestUser {

  return {
    username: createUsername(prefix),
    password: "ValidPass1!",
  };
}

/* Backend helpers */

export async function registerViaAPI(
  request: APIRequestContext,
  user: TestUser,
): Promise<TestUser> {
  const res = await request.post(`${BACKEND_URL}/register`, {
    data: {
      username: user.username,
      password: user.password,
      invitation_code: INVITATION_CODE,
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to register user (${res.status()}): ${body}`);
  }

  return user;
}

/* Convenience helper used by login tests */

export async function createAndRegisterUser(
  request: APIRequestContext,
  prefix = "pwlogin",
): Promise<TestUser> {
  const user = createTestUser(prefix);
  return registerViaAPI(request, user);
}

/* UI navigation helpers */

function headerLoginButton(page: Page) {
  return page.locator('button[type="button"]', { hasText: "Login" });
}

export async function gotoHome(page: Page) {
  await page.goto(FRONTEND_URL);
}

export async function openLoginDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Login" });

  if (await dialog.isVisible().catch(() => false)) {
    return dialog;
  }

  await headerLoginButton(page).click();

  await expect(dialog).toBeVisible();

  return dialog;
}

export async function gotoRegisterPage(page: Page) {
  await gotoHome(page);

  const loginDialog = await openLoginDialog(page);

  await loginDialog.getByRole("link", { name: "Register" }).click();

  await expect(
    page.getByRole("heading", { name: "Create an account" }),
  ).toBeVisible();
}

/* UI auth actions */

export async function loginViaUI(page: Page, user: TestUser) {
  const dialog = await openLoginDialog(page);

  await dialog.getByTestId("login-username").fill(user.username);

  await dialog.getByTestId("login-password").fill(user.password);

  await dialog.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible({
    timeout: 15000,
  });
  await expect(headerLoginButton(page)).toBeHidden();
}

export async function expectLoggedIn(page: Page) {
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expect(headerLoginButton(page)).toBeHidden();
}

export async function expectLoggedOut(page: Page) {
  await expect(headerLoginButton(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeHidden();
}

/* Register helpers */

export async function fillRegisterForm(
  page: Page,
  user: TestUser,
  invitationCode = INVITATION_CODE,
) {
  await page.getByTestId("register-username").fill(user.username);
  await page.getByTestId("register-password").fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByLabel("Invitation code").fill(invitationCode);
}

export async function submitRegister(page: Page) {
  await page.getByRole("button", { name: "Create user" }).click();
}

export async function expectRegisterSuccessAndRedirectToLogin(page: Page) {
  await expect(page.getByText("User registered successfully!")).toBeVisible();

  await expect(page.getByTestId("register-username")).toBeEmpty();
  await expect(page.getByTestId("register-password")).toBeEmpty();
  await expect(page.getByLabel("Confirm password")).toBeEmpty();
  await expect(page.getByLabel("Invitation code")).toBeEmpty();

  const escapedFrontendUrl = FRONTEND_URL.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  await expect(page).toHaveURL(new RegExp(`^${escapedFrontendUrl}/?$`), {
    timeout: 15_000,
  });

  const loginDialog = page.getByRole("dialog", { name: "Login" });
  await expect(loginDialog).toBeVisible();
}
