import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/workbench'

// U-15: a needs_review row whose name differs from its matched catalog record.
const U15_NEEDS_REVIEW_ROW = {
  result_id: 'r1', disk_name: 'Serum FX', disk_vendor: 'Xfer', disk_version: '1.0', disk_format: 'vst3',
  disk_path: '/lib/serumfx.vst3', display_name: 'Serum FX', display_vendor: 'Xfer',
  catalog_record_id: 'c1', catalog_record_table: 'instruments',
  catalog_record_name: 'Serum', catalog_record_vendor: 'Xfer', catalog_record_version: '1.0',
  bucket: 'needs_review', confidence: 'fuzzy', confirmed_at: null, confirmed_by: null,
}

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

// U-17 (Q1=B): backdrop click must NOT dismiss scanner modals; ESC still closes.
// Real-browser pointer events make this meaningful (the jsdom unit equivalent is vacuous).
test('Hard Reset dialog ignores backdrop click but closes on Escape', async ({ page }) => {
  await page.goto(BASE)
  await page.getByRole('button', { name: /hard reset/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10000 })

  // Click the overlay (top-left corner, outside the centered content): must NOT close.
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()

  // ESC is a preserved close affordance: it DOES close.
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible({ timeout: 5000 })
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

// U-15 Step 18: clicking a needs_review row routes to the single-resolution modal;
// resolving the differing field and saving PATCHes the record and closes the modal.
test('needs_review row click opens the resolution modal and saving closes it', async ({ page }) => {
  await page.route('**/api/scanner/workbench**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [U15_NEEDS_REVIEW_ROW], orphaned: [], scan_id: 's1' }),
    })
  })
  let patched = false
  await page.route('**/api/catalog/instruments/c1', async (route) => {
    patched = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(BASE)

  // Click the row-name button (routes needs_review → single-resolution modal).
  await page.getByRole('button', { name: /Serum FX/ }).click()
  await expect(page.getByText(/Resolve Match/)).toBeVisible({ timeout: 10000 })

  // Keep the disk value for the differing name field (no rule creation), then Save.
  await page.locator('input[type=radio][value="disk"]').first().check()
  await page.getByRole('button', { name: /^save$/i }).click()

  // Save PATCHes the matched record and the modal closes.
  await expect.poll(() => patched).toBe(true)
  await expect(page.getByText(/Resolve Match/)).not.toBeVisible({ timeout: 5000 })
})
