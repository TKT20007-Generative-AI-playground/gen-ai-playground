import { test, expect } from '@playwright/test';

test("Backend is running and returns hello message", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5000/");
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toEqual({ hello: "from gen-ai-playground backend" });
}, 30000);
