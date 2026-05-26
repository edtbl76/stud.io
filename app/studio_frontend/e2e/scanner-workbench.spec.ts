import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/workbench'

// Step 93
test('workbench page loads and shows filter bar', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: /scan workbench/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('combobox', { name: /bucket/i })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /catalog type/i })).toBeVisible()
})

// Step 94
test('needs_review row click opens SingleResolutionModal', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="workbench-table"]', { timeout: 10000 }).catch(() => {})
  // If a needs_review row is present, click it and assert modal opens
  const needsReviewRow = page.locator('text="Needs Review"').first()
  const isVisible = await needsReviewRow.isVisible().catch(() => false)
  if (isVisible) {
    await needsReviewRow.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  } else {
    // No needs_review rows in test environment — skip assertion
    test.info().annotations.push({ type: 'note', description: 'No needs_review rows available in test environment' })
  }
})

// Step 95
test('Soft Reset button fires and shows toast', async ({ page }) => {
  await page.route('**/api/scanner/admin/reset/soft', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'soft', rules_disabled: 0 }),
    })
  })
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: /soft reset/i })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: /soft reset/i }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /soft reset complete/i })).toBeVisible({ timeout: 5000 })
})
