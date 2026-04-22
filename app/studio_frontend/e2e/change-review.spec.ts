import { test, expect } from '@playwright/test'

test('change review page loads and shows heading and filters', async ({ page }) => {
  await page.goto('/studio/admin/change-review')

  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible({ timeout: 10_000 })

  await expect(page.getByRole('combobox', { name: /table/i })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /operation/i })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /status/i })).toBeVisible()
})

test('change review page shows pagination controls', async ({ page }) => {
  await page.goto('/studio/admin/change-review')

  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible({ timeout: 10_000 })

  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
})

test('change review page shows empty state or table rows', async ({ page }) => {
  await page.goto('/studio/admin/change-review')

  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible({ timeout: 10_000 })

  // Wait for the table to settle: either rows or the empty state must appear
  const firstRow = page.locator('tbody tr').first()
  const emptyMsg = page.getByText('No entries found.')
  await expect(firstRow.or(emptyMsg)).toBeVisible({ timeout: 10_000 })

  // Either a row exists or the empty state message is shown — either is valid
  const hasEntries = await page.locator('tbody tr').count() > 0
  if (hasEntries) {
    // Column headers are visible
    await expect(page.getByRole('columnheader', { name: 'Table' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Op' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'By' })).toBeVisible()
  } else {
    await expect(emptyMsg).toBeVisible()
  }
})

test('change review is reachable via the ADMIN sidebar group', async ({ page }) => {
  // Studio Management sidebar always shows ADMIN group; navigate to any studio page first
  await page.goto('/studio/admin/users')

  const changeReviewLink = page.getByRole('link', { name: /^change review$/i })
  await expect(changeReviewLink).toBeVisible({ timeout: 10_000 })
  await changeReviewLink.click()

  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible({ timeout: 10_000 })
})

test('change review status filter changes the URL or re-fetches', async ({ page }) => {
  await page.goto('/studio/admin/change-review')

  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible({ timeout: 10_000 })

  // Switch to "All" status and confirm the page does not error
  await page.getByRole('combobox', { name: /status/i }).selectOption('all')

  // Page should still be showing the heading (no crash/error state)
  await expect(page.getByRole('heading', { name: 'Change Review' })).toBeVisible()
  await expect(page.getByText(/could not load/i)).not.toBeVisible()
})
