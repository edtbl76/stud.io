import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'https://localhost:2112',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { browserName: 'chromium', storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
  workers: 1,
  retries: 0,
})
