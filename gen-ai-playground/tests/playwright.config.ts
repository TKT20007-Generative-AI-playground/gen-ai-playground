import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: require.resolve('./auth.setup'),
  use: {
    storageState: 'playwright/.auth/user.json',
  },
});
