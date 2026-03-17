import { test, expect } from '@playwright/test'

test('backup download succeeds', async ({ page }) => {
  await page.goto('/admin/backup')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download backup/i }).click(),
  ])

  expect(download.suggestedFilename()).toMatch(/^controlroomdb_\d+\.sql$/)
})
