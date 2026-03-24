import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 10000,

  projects: [
    {
      name: "setup",
      testDir: "tests/setup",
      testMatch: /auth\.setup\.ts/,
    },

    {
      name: "public",
      testDir: "tests/public",
      use: {
        storageState: undefined,
      },
    },

    {
      name: "authenticated",
      testDir: "tests/authenticated",
      use: {
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
