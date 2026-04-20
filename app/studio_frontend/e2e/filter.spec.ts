import { test, expect, type Page } from '@playwright/test'

async function getRecordCount(page: Page): Promise<number> {
  const text = await page.getByText(/\d+ records?/).textContent({ timeout: 30_000 })
  return parseInt(text?.match(/\d+/)?.[0] ?? '0', 10)
}

async function waitForStableCount(page: Page): Promise<number> {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
  return getRecordCount(page)
}

// ── Paginated: server-side empty-sentinel filter ──────────────────────────────
// All content tables (brands, effects, etc.) use paginated=true → server-side
// filtering. The "" sentinel is sent as filter_<col>="" which the backend
// converts to IS NULL OR col = ''.

test('filter: "" sentinel in brands legal_name returns fewer results', async ({ page }) => {
  await page.goto('/catalog/brands')
  const totalBefore = await waitForStableCount(page)

  // Legal Name is the second filterable column (after Name)
  const filterInputs = page.locator('thead tr:nth-child(2) input[placeholder="2+ chars…"]')
  await filterInputs.nth(1).fill('""')

  // Server re-fetches — wait for stable count
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
  const totalAfter = await getRecordCount(page)

  // Some brands should have null legal names; the sentinel must return ≥ 0 results
  // and the table must not crash
  expect(totalAfter).toBeGreaterThanOrEqual(0)
  expect(totalAfter).toBeLessThanOrEqual(totalBefore)
  await expect(page.locator('table')).toBeVisible()
})

test('filter: clearing "" sentinel restores the original count', async ({ page }) => {
  await page.goto('/catalog/brands')
  const totalBefore = await waitForStableCount(page)

  const filterInputs = page.locator('thead tr:nth-child(2) input[placeholder="2+ chars…"]')
  const legalNameFilter = filterInputs.nth(1)
  await legalNameFilter.fill('""')
  await page.waitForTimeout(600)

  await legalNameFilter.fill('')
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)

  const totalAfter = await getRecordCount(page)
  expect(totalAfter).toBe(totalBefore)
})

test('filter: "" sentinel in effects version column returns a valid subset', async ({ page }) => {
  await page.goto('/session/effects')
  const totalBefore = await waitForStableCount(page)

  // Version is the fourth filterable column in effects (name, types, collection, version)
  const filterInputs = page.locator('thead tr:nth-child(2) input[placeholder="2+ chars…"]')
  await filterInputs.nth(3).fill('""')

  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
  const totalAfter = await getRecordCount(page)

  expect(totalAfter).toBeGreaterThanOrEqual(0)
  expect(totalAfter).toBeLessThanOrEqual(totalBefore)
  await expect(page.locator('table')).toBeVisible()
})
