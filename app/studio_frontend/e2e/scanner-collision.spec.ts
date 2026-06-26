import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/workbench'

const COLLISION_ROW = {
  result_id: 'r1', disk_name: 'Pro-Q 3', disk_vendor: 'FabFilter', disk_version: '3.0', disk_format: 'vst3',
  disk_path: '/lib/proq.vst3', display_name: 'Pro-Q 3', display_vendor: 'FabFilter',
  catalog_record_id: 'c1', catalog_record_table: 'effects',
  catalog_record_name: 'Pro-Q 3', catalog_record_vendor: 'FabFilter', catalog_record_version: '3.0',
  bucket: 'collision', confidence: 'exact', confirmed_at: null, confirmed_by: null,
  collision: {
    shared_catalog_record: { id: 'c1', table: 'effects', name: 'Pro-Q 3', vendor: 'FabFilter', version: '3.0' },
    copies: [
      { result_id: 'r1', path: '/lib/proq.vst3', version: '3.0', format: 'vst3' },
      { result_id: 'r2', path: '/users/ed/proq.vst3', version: '3.0', format: 'vst3' },
    ],
  },
}

// U-18: a collision row resolves through the record-centric modal (keep all → acknowledge each copy).
test('collision row opens the record-centric modal and Keep all acknowledges every copy', async ({ page }) => {
  await page.route('**/api/scanner/workbench**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [COLLISION_ROW], orphaned: [], scan_id: 's1' }),
    })
  })
  let confirmCalls = 0
  await page.route('**/api/scanner/confirm', async (route) => {
    confirmCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applied: 1, errors: [] }),
    })
  })

  await page.goto(BASE)

  // The collision row exposes a per-row Resolve trigger (U-18 Q1=B).
  const resolve = page.getByRole('button', { name: /^resolve$/i }).first()
  await expect(resolve).toBeVisible({ timeout: 10000 })
  await resolve.click()

  // The modal is record-centric: it shows the shared record and every duplicate copy.
  await expect(page.getByText(/Resolve Collision/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('/lib/proq.vst3')).toBeVisible()
  await expect(page.getByText('/users/ed/proq.vst3')).toBeVisible()

  // Keep all acknowledges every copy, then the modal closes.
  await page.getByTestId('collision-keep-all').click()
  await expect.poll(() => confirmCalls).toBeGreaterThanOrEqual(1)
  await expect(page.getByText(/Resolve Collision/)).not.toBeVisible({ timeout: 5000 })
})
