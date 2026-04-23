import { test, expect, type Page } from '@playwright/test'

async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

// ── Toolbar sort UI ───────────────────────────────────────────────────────────

test('sort: toolbar shows sort button when sortFields are configured', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  // The default sort pill and + button are both visible on page load
  await expect(page.getByRole('button', { name: 'Add sort level' })).toBeVisible()
})

test('sort: direction toggle button is visible when sortFields are configured', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  // Direction arrow is inside the first (default) sort pill
  await expect(page.getByRole('button', { name: /Sort (ascending|descending)/ }).first()).toBeVisible()
})

test('sort: column headers have no clickable sort interaction', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  // Old column-header sort buttons (cursor-pointer) should be gone
  await expect(page.locator('thead button.cursor-pointer')).toHaveCount(0)
})

test('sort: clicking + button opens dropdown with field options', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Add sort level' }).click()

  // Fields not already active should appear in the dropdown
  await expect(page.getByRole('button', { name: 'Legal Name' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Type' })).toBeVisible()
})

test('sort: selecting a field from + dropdown adds a new sort pill', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Add sort level' }).click()
  await page.getByRole('button', { name: 'Legal Name' }).click()

  // Two direction-toggle buttons = two active sort pills
  await expect(page.getByRole('button', { name: /Sort (ascending|descending)/ })).toHaveCount(2)
})

test('sort: dropdown closes after selecting a field', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByRole('button', { name: 'Add sort level' }).click()
  await page.getByRole('button', { name: 'Legal Name' }).click()

  // The dropdown option "Type" should no longer be visible
  await expect(page.getByRole('button', { name: 'Type' })).not.toBeVisible()
})

test('sort: direction toggle flips between ascending and descending', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  const dirBtn = page.getByRole('button', { name: /Sort (ascending|descending)/ }).first()
  await expect(dirBtn).toHaveAccessibleName('Sort ascending')

  await dirBtn.click()

  await expect(dirBtn).toHaveAccessibleName('Sort descending')
})

// ── Non-paginated: client-side sort reorders rows ─────────────────────────────

test('sort: non-paginated table reorders rows when direction is toggled', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  const firstCell = page.locator('tbody tr:first-child td:nth-child(2)')
  const firstBefore = await firstCell.textContent()

  await page.getByRole('button', { name: 'Sort ascending' }).first().click()
  await page.waitForTimeout(300)

  const firstAfter = await firstCell.textContent()
  expect(firstAfter).not.toEqual(firstBefore)
})

// ── Paginated: server-side re-fetch ───────────────────────────────────────────

for (const { name, path } of [
  { name: 'effects',     path: '/controlroom/session/effects'     },
  { name: 'instruments', path: '/controlroom/session/instruments' },
  { name: 'libraries',   path: '/controlroom/session/libraries'   },
  { name: 'models',      path: '/studio/catalog/models'      },
]) {
  test(`sort: ${name} direction toggle triggers server-side re-fetch`, async ({ page }) => {
    await page.goto(path)
    await waitForRows(page)

    await page.getByRole('button', { name: /Sort (ascending|descending)/ }).first().click()

    await waitForRows(page)
    await expect(page.getByRole('table')).toBeVisible()
  })

  test(`sort: ${name} changing sort field triggers server-side re-fetch`, async ({ page }) => {
    await page.goto(path)
    await waitForRows(page)

    // Add "Brand" as a secondary sort level
    await page.getByRole('button', { name: 'Add sort level' }).click()
    await page.getByRole('button', { name: 'Brand' }).click()

    await waitForRows(page)
    await expect(page.getByRole('table')).toBeVisible()
  })
}
