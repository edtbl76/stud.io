import { defineConfig } from '@playwright/test'

// Used by test-e2e.sh — points at the on-demand test stack (controlroomdb_test).
// Do NOT use this config to run tests against the production dev server.
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
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
