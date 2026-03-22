import { test, expect, type Page } from '@playwright/test'

async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

// ── Toolbar sort UI ───────────────────────────────────────────────────────────

test('sort: toolbar shows sort button when sortFields are configured', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  await expect(page.getByRole('button', { name: 'Sort by' })).toBeVisible()
})

test('sort: direction toggle button is visible when sortFields are configured', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  await expect(page.getByRole('button', { name: /Sort (ascending|descending)/ })).toBeVisible()
})

test('sort: column headers have no clickable sort interaction', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  // Old column-header sort buttons (cursor-pointer) should be gone
  await expect(page.locator('thead button.cursor-pointer')).toHaveCount(0)
})

test('sort: clicking sort button opens dropdown with field options', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Sort by' }).click()

  // Brand sort fields
  await expect(page.getByRole('button', { name: 'Brand Name' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Legal Name' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Type' })).toBeVisible()
})

test('sort: selecting a field updates the sort button label', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Sort by' }).click()
  await page.getByRole('button', { name: 'Legal Name' }).click()

  await expect(page.getByRole('button', { name: 'Sort by' })).toContainText('Legal Name')
})

test('sort: dropdown closes after selecting a field', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Sort by' }).click()
  await page.getByRole('button', { name: 'Legal Name' }).click()

  await expect(page.getByRole('button', { name: 'Brand Name' })).not.toBeVisible()
})

test('sort: direction toggle flips between ascending and descending', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  const dirBtn = page.getByRole('button', { name: /Sort (ascending|descending)/ })
  await expect(dirBtn).toHaveAccessibleName('Sort ascending')

  await dirBtn.click()

  await expect(dirBtn).toHaveAccessibleName('Sort descending')
})

// ── Non-paginated: client-side sort reorders rows ─────────────────────────────

test('sort: non-paginated table reorders rows when direction is toggled', async ({ page }) => {
  await page.goto('/catalog/brands')
  await waitForRows(page)

  const firstCell = page.locator('tbody tr:first-child td:nth-child(2)')
  const firstBefore = await firstCell.textContent()

  await page.getByRole('button', { name: 'Sort ascending' }).click()
  await page.waitForTimeout(300)

  const firstAfter = await firstCell.textContent()
  expect(firstAfter).not.toEqual(firstBefore)
})

// ── Paginated: server-side re-fetch ───────────────────────────────────────────

for (const { name, path } of [
  { name: 'effects',     path: '/session/effects'     },
  { name: 'instruments', path: '/session/instruments' },
  { name: 'libraries',   path: '/session/libraries'   },
  { name: 'models',      path: '/catalog/models'      },
]) {
  test(`sort: ${name} direction toggle triggers server-side re-fetch`, async ({ page }) => {
    await page.goto(path)
    await waitForRows(page)

    await page.getByRole('button', { name: /Sort (ascending|descending)/ }).click()

    await waitForRows(page)
    await expect(page.getByRole('table')).toBeVisible()
  })

  test(`sort: ${name} changing sort field triggers server-side re-fetch`, async ({ page }) => {
    await page.goto(path)
    await waitForRows(page)

    // All paginated tables have "Brand" as a sort field
    await page.getByRole('button', { name: 'Sort by' }).click()
    await page.getByRole('button', { name: 'Brand' }).click()

    await waitForRows(page)
    await expect(page.getByRole('table')).toBeVisible()
  })
}
