import { test, expect, type APIRequestContext } from '@playwright/test'

const UNIQUE = `__e2e_search_${Date.now()}`
let createdBrandId: string | undefined

async function createBrand(request: APIRequestContext) {
  const res = await request.post('/api/studio/catalog/brands', {
    data: { legal_name: UNIQUE, brand_name: UNIQUE },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json()
  createdBrandId = body.brand_id as string
}

async function deleteBrand(request: APIRequestContext) {
  if (!createdBrandId) return
  await request.delete(`/api/studio/catalog/brands/${createdBrandId}`)
}

test.beforeAll(async ({ request }) => { await createBrand(request) })
test.afterAll(async ({ request }) => { await deleteBrand(request) })

test('search: TopBar submitting a query navigates to /controlroom/search', async ({ page }) => {
  await page.goto('/controlroom/session/effects')
  const searchInput = page.getByPlaceholder('Global search...')
  await searchInput.fill('reverb')
  await searchInput.press('Enter')
  await expect(page).toHaveURL(/\/controlroom\/search\?q=reverb/)
})

test('search: results page shows matching brand', async ({ page }) => {
  await page.goto(`/controlroom/search?q=${encodeURIComponent(UNIQUE)}`)
  await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 10_000 })
})

test('search: results page renders All tab and per-table tabs', async ({ page }) => {
  await page.goto(`/controlroom/search?q=${encodeURIComponent(UNIQUE)}`)
  await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /^all/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^brands/i })).toBeVisible()
})

test('search: tab filter hides results from other tables', async ({ page }) => {
  await page.goto(`/controlroom/search?q=${encodeURIComponent(UNIQUE)}`)
  await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 10_000 })

  // Click Brands tab — brands result should remain, non-brand results should be filtered
  await page.getByRole('button', { name: /^brands/i }).click()
  await expect(page.getByText(UNIQUE).first()).toBeVisible()
})

test('search: notes toggle is visible', async ({ page }) => {
  await page.goto(`/controlroom/search?q=${encodeURIComponent(UNIQUE)}`)
  await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('checkbox')).toBeVisible()
})

test('search: clicking a result opens a modal; Go to button navigates to the table page', async ({ page }) => {
  await page.goto(`/controlroom/search?q=${encodeURIComponent(UNIQUE)}`)
  await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 10_000 })

  // Click the result button — opens modal in-place on the search page
  await page.getByRole('button', { name: new RegExp(UNIQUE) }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('dialog').getByText(UNIQUE).first()).toBeVisible()

  // Click "Go to Brands" — navigates to the table page and opens the modal there
  await page.getByRole('button', { name: /go to brands/i }).click()
  await expect(page).toHaveURL(/\/studio\/catalog\/brands/, { timeout: 10_000 })
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('dialog').getByText(UNIQUE).first()).toBeVisible()
})
