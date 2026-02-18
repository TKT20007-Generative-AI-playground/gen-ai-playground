import { defineConfig } from '@playwright/test';

// Export playwright configuration
export default defineConfig({
  globalSetup: require.resolve('./auth.setup'),
  use: {
    storageState: 'playwright/.auth/user.json',
  },
});
