import { defineConfig } from '@playwright/test'

// Used by test-perf.sh — points at the perf stack (production build, controlroomdb_test).
// Requires browser launched with --remote-debugging-port for Lighthouse CDP access.
export default defineConfig({
  testDir: './e2e',
  testMatch: /perf\.spec\.ts/,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3010',
    launchOptions: {
      args: ['--remote-debugging-port=9222'],
    },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/state.json',
      },
      dependencies: ['setup'],
    },
  ],
  workers: 1,   // fixed --remote-debugging-port requires single worker
  retries: 0,
  timeout: 90000,  // Lighthouse audits are slow
})
