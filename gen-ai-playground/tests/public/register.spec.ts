import { test, expect } from "@playwright/test";
import {
  gotoRegisterPage,
  INVITATION_CODE,
  createValidRegisterUser,
  fillRegisterForm,
  submitRegister,
  expectRegisterSuccessAndRedirectToLogin,
} from "../helpers/auth";

test.describe("Register", () => {
  test("shows an error when passwords do not match", async ({ page }) => {
    await gotoRegisterPage(page);
    await page.getByTestId("register-username").fill("user123");
    await page.getByTestId("register-password").fill("ValidPass1!");
    await page.getByLabel("Confirm password").fill("DifferentPass1!");
    await page.getByLabel("Invitation code").fill("any-code");
    await submitRegister(page);
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("shows live password validation errors and clears when fixed", async ({
    page,
  }) => {
    await gotoRegisterPage(page);
    const pw = page.getByTestId("register-password");
    await pw.fill("aA1!");
    await expect(
      page.getByText("Password must be at least 8 characters long"),
    ).toBeVisible();
    await pw.fill("lowercase1!");
    await expect(
      page.getByText("Password must contain at least one uppercase letter"),
    ).toBeVisible();
    await pw.fill("NoNumber!");
    await expect(
      page.getByText("Password must contain at least one number"),
    ).toBeVisible();
    await pw.fill("NoSpecial1");
    await expect(
      page.getByText("Password must contain at least one special character"),
    ).toBeVisible();
    await pw.fill("ValidPass1!");
    await expect(
      page.getByText("Password must be at least 8 characters long"),
    ).toBeHidden();
    await expect(
      page.getByText("Password must contain at least one uppercase letter"),
    ).toBeHidden();
    await expect(
      page.getByText("Password must contain at least one number"),
    ).toBeHidden();
    await expect(
      page.getByText("Password must contain at least one special character"),
    ).toBeHidden();
  });

  test("invalid password blocks submit and does not call backend", async ({
    page,
  }) => {
    await gotoRegisterPage(page);
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/register") && req.method() === "POST") {
        requests.push(req.url());
      }
    });
    await page.route("**/register", async (route) => {
      await route.fulfill({ status: 500, body: "Should not be called" });
    });
    const badUser = { username: "user123", password: "aA1!" };
    await fillRegisterForm(page, badUser, "any-code");
    await submitRegister(page);
    await expect(
      page
        .getByRole("alert")
        .getByText("Password must be at least 8 characters long"),
    ).toBeVisible();
    expect(requests.length).toBe(0);
  });

  test("successful registration returns home and opens login modal", async ({
    page,
  }) => {
    await gotoRegisterPage(page);
    const user = createValidRegisterUser();
    await fillRegisterForm(page, user, INVITATION_CODE);
    await submitRegister(page);
    await expectRegisterSuccessAndRedirectToLogin(page);
  });

  test("backend error is surfaced (invalid invitation code)", async ({
    page,
  }) => {
    await gotoRegisterPage(page);
    const user = createValidRegisterUser("pw_register_bad_invite");
    await fillRegisterForm(page, user, "definitely-wrong-invitation-code");
    await submitRegister(page);
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("User registered successfully!")).toBeHidden();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('shows "Registration failed" on network failure', async ({ page }) => {
    await gotoRegisterPage(page);
    const user = createValidRegisterUser("networkfailure");
    await page.route("**/register", async (route) => {
      await route.abort();
    });
    await fillRegisterForm(page, user, INVITATION_CODE);
    await submitRegister(page);
    await expect(page.getByText("Registration failed")).toBeVisible();
  });
});
