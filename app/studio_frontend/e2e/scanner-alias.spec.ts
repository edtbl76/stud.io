import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/workbench'

const NEEDS_REVIEW_ROW = {
  result_id: 'r1', disk_name: 'Serum FX', disk_vendor: 'Xfer', disk_version: '1.0', disk_format: 'vst3',
  disk_path: '/lib/serumfx.vst3', display_name: 'Serum FX', display_vendor: 'Xfer',
  catalog_record_id: 'c1', catalog_record_table: 'instruments',
  catalog_record_name: 'Serum', catalog_record_vendor: 'Xfer', catalog_record_version: '1.0',
  bucket: 'needs_review', confidence: 'fuzzy', confirmed_at: null, confirmed_by: null,
}

// U-19: Set Name Alias in the single-row resolution modal writes a direct alias and keeps the modal open.
test('Set Name Alias posts the raw disk name to the matched record and keeps the modal open', async ({ page }) => {
  await page.route('**/api/scanner/workbench**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [NEEDS_REVIEW_ROW], scan_id: 's1' }),
    })
  })
  let aliasBody: { disk_name?: string; catalog_record_id?: string; catalog_table?: string } | null = null
  await page.route('**/api/scanner/aliases', async (route) => {
    aliasBody = route.request().postDataJSON() as typeof aliasBody
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
  })

  await page.goto(BASE)

  // The single-row modal opens from the bulk-resolve queue: select the needs_review
  // row, then click the bulk "Resolve" action.
  await expect(page.getByText('Serum FX').first()).toBeVisible({ timeout: 10000 })
  // Scope the selection to the Serum FX row's own checkbox (avoid any select-all / unrelated controls).
  const serumRow = page.locator('div').filter({ hasText: 'Serum FX' }).filter({ has: page.getByRole('checkbox') }).last()
  await serumRow.getByRole('checkbox').check()
  await page.getByRole('button', { name: /^resolve$/i }).first().click()
  await expect(page.getByText(/Resolve Match/)).toBeVisible({ timeout: 10000 })

  // Set Name Alias posts the raw disk name → the matched record.
  await page.getByTestId('set-name-alias').click()
  await expect.poll(() => aliasBody).not.toBeNull()
  expect(aliasBody).toEqual({ disk_name: 'Serum FX', catalog_record_id: 'c1', catalog_table: 'instruments' })

  // Success toast appears and the modal stays open (Q5).
  await expect(page.getByText(/Alias set: Serum FX/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/Resolve Match/)).toBeVisible()
})
