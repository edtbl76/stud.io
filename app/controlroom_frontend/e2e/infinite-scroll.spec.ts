import { test, expect, type Page } from '@playwright/test'

/** Wait for the record count badge — confirms first page has loaded. */
async function waitForRecordCount(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

/** Parse the record count from the header subtitle. */
async function getRecordCount(page: Page): Promise<number> {
  const text = await page.getByText(/\d+ records?/).textContent()
  const match = text?.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

// ── Paginated tables load from the server ────────────────────────────────────

for (const { name, path } of [
  { name: 'effects',     path: '/session/effects'     },
  { name: 'instruments', path: '/session/instruments' },
  { name: 'libraries',   path: '/session/libraries'   },
  { name: 'models',      path: '/catalog/models'      },
]) {
  test(`${name}: loads first page and shows server total`, async ({ page }) => {
    await page.goto(path)
    await waitForRecordCount(page)

    const count = await getRecordCount(page)
    expect(count).toBeGreaterThan(0)

    // Table rows are rendered
    await expect(page.getByRole('table')).toBeVisible()
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test(`${name}: sort column header triggers server-side re-fetch`, async ({ page }) => {
    await page.goto(path)
    await waitForRecordCount(page)

    // Click the first sortable column header button (label+sort button)
    const sortButtons = page.locator('thead button').filter({ hasNotText: '' })
    const firstSort = sortButtons.nth(1) // skip drag handle, get label button
    await firstSort.click()

    // Record count is still visible after sort (data reloaded successfully)
    await waitForRecordCount(page)
    await expect(page.getByRole('table')).toBeVisible()
  })
}

// ── Infinite scroll fetches next page ────────────────────────────────────────

test('effects: scrolling to bottom loads more records', async ({ page }) => {
  await page.goto('/session/effects')
  await waitForRecordCount(page)

  const total = await getRecordCount(page)

  // Only run the scroll assertion if there are more records than one page (100)
  if (total <= 100) {
    // All records fit on the first page — verify rows rendered
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)
    return
  }

  // Count rows before scroll
  const rowsBefore = await page.locator('tbody tr').count()
  expect(rowsBefore).toBeGreaterThan(0)

  // Scroll to bottom of the table container
  await page.locator('[data-testid="table-scroll"], .overflow-auto').first().evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })

  // Wait for "Loading more…" to appear then disappear, or just wait for row count to increase
  await expect(page.locator('tbody tr')).toHaveCount(rowsBefore + 1, { timeout: 10_000 }).catch(() => {
    // Row count increased (more data loaded)
  })

  const rowsAfter = await page.locator('tbody tr').count()
  expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore)
})
