import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

async function triggerBackupDownload(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download backup/i }).click(),
  ])
  return download
}

test('backup download succeeds', async ({ page }) => {
  await page.goto('/studio/admin/backup')
  const download = await triggerBackupDownload(page)
  expect(download.suggestedFilename()).toMatch(/^masterdb_\d{8}_\d{6}\.sql$/)
})

test('verify backup passes after fresh download', async ({ page }) => {
  // verify creates a temp DB, restores the backup, computes hashes, and drops the DB
  test.setTimeout(90_000)

  await page.goto('/studio/admin/backup')
  const download = await triggerBackupDownload(page)
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  const verifySection = page.locator('section').filter({ hasText: 'Verify Backup' })
  await verifySection.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(fs.readFileSync(backupPath)),
  })

  // wait for React to process the onChange before clicking
  await expect(page.getByRole('button', { name: /verify backup/i })).toBeEnabled()
  await page.getByRole('button', { name: /verify backup/i }).click()

  await expect(page.getByText('PASSED')).toBeVisible({ timeout: 60_000 })
})
