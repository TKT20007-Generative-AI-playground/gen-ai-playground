import { test, expect } from "@playwright/test";
import {
  gotoHome,
  createAndRegisterUser,
  loginViaUI,
  expectLoggedIn,
} from "../helpers/auth";

test("frontpage displays correct title and elements", async ({
  page,
}) => {
  await gotoHome(page);
  await expect(page.getByRole('heading', { name: 'WELCOME TO' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PLAYGROUND', exact: true })).toBeVisible()
  await expect(page.locator('video source[src="/videos/background-video.mp4"]')).toHaveCount(1)
  await expect(page.locator('#root')).toContainText('Login');
  await expect(page.getByText('Image generators', { exact: true })).toBeVisible()
  await expect(page.getByText('Image Editor', { exact: true })).toBeVisible()
  await expect(page.getByText('Text generators', { exact: true })).toBeVisible()
  await expect(page.locator('#root')).toContainText('Get started with the Generative AI Playground');

  const github = page.getByRole('link', { name: /GitHub/ })
  await expect(github).toHaveAttribute('href', 'https://github.com/TKT20007-Generative-AI-playground/gen-ai-playground')
  await expect(github).toHaveAttribute('target', '_blank')
  await expect(github).toHaveAttribute('rel', /noopener/)
});

test("clicking cards takes to login when not logged in", async ({ page }) => {
  await gotoHome(page);
  await page.click('text=Go to image generators');
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await gotoHome(page);
  await page.click('text=Go to image editor');
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await gotoHome(page);
  await page.click('text=Go to text generators');
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
});

test("clicking cards takes to correct page when logged in", async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);

  await page.click('text=Go to image generators');
  await expect(page.locator('#root')).toContainText('Select at least 1 model for image generation');
  
  await gotoHome(page);
  await page.click('text=Go to image editor');
  await expect(page.locator('#root')).toContainText('Upload an image, select a model, and enter a prompt to enable editing.');

  await gotoHome(page);
  await page.click('text=Go to text generators');
  await expect(page.locator('#root')).toContainText('Select up to 4 models for text generation.');
});

test("get started button takes to login when not logged in", async ({ page }) => {
  await gotoHome(page);
  await page.click('text=Get Started');
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
});

test("get started button takes to image generators when logged in", async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);

  await page.click('text=Get Started');
  await expect(page.locator('#root')).toContainText('Select at least 1 model for image generation');
}   );

test("clicking a card then logging in lands on the originally requested page", async ({ page, request }) => {
  const user = await createAndRegisterUser(request)
  await gotoHome(page)
  await page.click('text=Go to image editor')
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await loginViaUI(page, user)  // make sure your helper works with the modal already open
  await expect(page).toHaveURL(/\/playground\/ImageEditor/)
})

test("featured works carousel is visible and has images", async ({ page }) => {
  await gotoHome(page);
  const carousel = page.getByTestId('showcase-carousel');
  await expect(carousel).toBeVisible();
  const images = carousel.locator('img');
  await expect(images.first()).toBeVisible();
});

test("hovering carousel cards shows button and clicking it takes to correct page", async ({ page, request }) => {
  const user = await createAndRegisterUser(request);
  await gotoHome(page);
  await loginViaUI(page, user);
  await expectLoggedIn(page);

  const slide = page.getByTestId('showcase-slide').first();
  await slide.hover({ force: true });
  await slide.getByRole('button', { name: 'Edit' }).click({ force: true });
  await expect(page.locator('#root')).toContainText('Upload an image, select a model, and enter a prompt to enable editing.');
}   );

test("clicking showcase Edit when logged out opens login", async ({ page }) => {
  await gotoHome(page)
  const slide = page.locator('.showcase-slide').first()
  await slide.hover({ force: true })
  await slide.getByRole('button', { name: 'Edit' }).click({ force: true })
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible()
})

test("frontpage renders core sections on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await gotoHome(page);

  // Hero
  await expect(page.getByRole('heading', { name: 'GENERATIVE AI', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

  // HoverCards (should wrap vertically at this width)
  await expect(page.getByText('Image generators', { exact: true })).toBeVisible();
  await expect(page.getByText('Image Editor', { exact: true })).toBeVisible();
  await expect(page.getByText('Text generators', { exact: true })).toBeVisible();

  // Info banner
  await expect(page.locator('#root')).toContainText('Get started with the Generative AI Playground');

  // Carousel — scroll into view since it sits far down the page on mobile
  const slide = page.locator('.showcase-slide').first();
  await slide.scrollIntoViewIfNeeded();
  await expect(slide).toBeVisible();

  // GitHub button
  const github = page.getByRole('link', { name: /GitHub/ });
  await github.scrollIntoViewIfNeeded();
  await expect(github).toBeVisible();
});