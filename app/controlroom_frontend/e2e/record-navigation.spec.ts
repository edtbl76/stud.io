import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/** Waits for the record count label — only rendered after React hydrates and data loads. */
async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

/** Opens the first row in a table and returns the dialog. */
async function openFirstRecord(page: Page) {
  await waitForRows(page)
  const firstRow = page.locator('table tbody tr').first()
  await firstRow.locator('td').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  return page.getByRole('dialog')
}

// ── Table page navigation ─────────────────────────────────────────────────────

test('record navigation: ← button is disabled on first record', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)
  const prevBtn = dialog.getByRole('button', { name: /previous record/i })
  await expect(prevBtn).toBeVisible()
  await expect(prevBtn).toBeDisabled()
})

test('record navigation: → button is enabled on first record when multiple records exist', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)
  const nextBtn = dialog.getByRole('button', { name: /next record/i })
  await expect(nextBtn).toBeVisible()
  await expect(nextBtn).toBeEnabled()
})

test('record navigation: clicking → advances to the next record', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)

  const titleBefore = await dialog.getByRole('heading').first().innerText()

  await dialog.getByRole('button', { name: /next record/i }).click()

  // Dialog should still be open and title should have changed
  await expect(dialog).toBeVisible()
  const titleAfter = await dialog.getByRole('heading').first().innerText()
  expect(titleAfter).not.toBe(titleBefore)
})

test('record navigation: shows position counter (N of M)', async ({ page }) => {
  await page.goto('/catalog/brands')
  await openFirstRecord(page)
  await expect(page.getByText(/1 of \d+/)).toBeVisible()
})

test('record navigation: pressing ArrowRight navigates to next record', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)

  const titleBefore = await dialog.getByRole('heading').first().innerText()
  await page.keyboard.press('ArrowRight')

  await expect(dialog).toBeVisible()
  const titleAfter = await dialog.getByRole('heading').first().innerText()
  expect(titleAfter).not.toBe(titleBefore)
})

test('record navigation: pressing ArrowLeft on first record does nothing', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)

  const titleBefore = await dialog.getByRole('heading').first().innerText()
  await page.keyboard.press('ArrowLeft')

  await expect(dialog).toBeVisible()
  const titleAfter = await dialog.getByRole('heading').first().innerText()
  expect(titleAfter).toBe(titleBefore)
})

test('record navigation: arrow keys do not fire while in edit mode', async ({ page }) => {
  await page.goto('/catalog/brands')
  const dialog = await openFirstRecord(page)

  await dialog.getByRole('button', { name: /^edit$/i }).click()
  const titleBefore = await dialog.getByRole('heading').first().innerText()

  // Pressing right while editing should NOT navigate
  await page.keyboard.press('ArrowRight')
  await expect(dialog).toBeVisible()
  const titleAfter = await dialog.getByRole('heading').first().innerText()
  expect(titleAfter).toBe(titleBefore)
})

// ── Search page navigation ────────────────────────────────────────────────────
// Two brands with a shared unique prefix guarantee ≥2 results for navigation.

const NAV_PREFIX = `__e2e_nav_${Date.now()}`
const brandIds: string[] = []

async function createBrand(request: APIRequestContext, suffix: string): Promise<string> {
  const name = `${NAV_PREFIX}_${suffix}`
  const res = await request.post('/api/brands', {
    data: { legal_name: name, brand_name: name },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json() as { brand_id: string }
  return body.brand_id
}

test.beforeAll(async ({ request }) => {
  brandIds.push(await createBrand(request, 'A'))
  brandIds.push(await createBrand(request, 'B'))
})

test.afterAll(async ({ request }) => {
  for (const id of brandIds) {
    await request.delete(`/api/brands/${id}`)
  }
})

test('search: navigation buttons appear in modal when there are multiple results', async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(NAV_PREFIX)}`)
  await expect(page.getByText(/\d+ result/i)).toBeVisible({ timeout: 15_000 })

  // Open the first result by name so we target a search result button specifically
  const firstResult = page.getByRole('button', { name: new RegExp(NAV_PREFIX) }).first()
  await expect(firstResult).toBeVisible()
  await firstResult.click()

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  // Both navigation buttons should be present; prev is disabled on the first result
  await expect(page.getByRole('button', { name: /previous record/i })).toBeDisabled()
  await expect(page.getByRole('button', { name: /next record/i })).toBeEnabled()
})
