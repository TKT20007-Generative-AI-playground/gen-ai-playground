import { test, expect } from "@playwright/test";
import {
  FRONTEND_URL,
  gotoHome,
  openLoginDialog,
  createAndRegisterUser,
  loginViaUI,
  expectLoggedIn,
  expectLoggedOut,
} from "../helpers/auth";

test("logging in makes protected content available", async ({
  page,
  request,
}) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  await expect(page.getByRole('heading', { name: 'GENERATIVE AI', exact: true })).toBeVisible();
  await expect(page.locator('#root')).toContainText('Login');
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  // Note: Authentication uses HTTPOnly cookies (not localStorage) for security
  await expect(page.locator('#root')).toContainText('Logout');
});

test("login persists after reload", async ({ page }) => {
  const user = await createAndRegisterUser(page.request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  await expect(page.locator('#root')).toContainText('Logout');
  await page.reload();
  await expectLoggedIn(page);
  await expect(page.locator('#root')).toContainText('Logout');
});

test("shows error on invalid credentials", async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  const loginDialog = await openLoginDialog(page);
  await loginDialog.getByTestId("login-username").fill(user.username);
  await loginDialog.getByTestId("login-password").fill("wrong-password");
  await loginDialog.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText("Login failed")).toBeVisible();
  await expectLoggedOut(page);
  await expect(loginDialog).toBeVisible();
});


test("logout clears auth and protected content requires login again", async ({
  page,
}) => {
  const user = await createAndRegisterUser(page.request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);
  await page.getByRole("button", { name: "Logout" }).click();
  await expectLoggedOut(page);
  await page.goto(`${FRONTEND_URL}/playground`);
  await expect(page).not.toHaveURL(/\/playground$/);
  await expect(page.locator('#root')).toContainText('Login');
  await page.reload();
  await expect(page.locator('#root')).toContainText('Login');
});
