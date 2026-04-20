import { test, expect } from '@playwright/test'

test('stats page loads and displays content from all four groups', async ({ page }) => {
  await page.goto('/controlroom/admin/stats')

  // Wait for the page heading — confirms the page rendered without error
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible({ timeout: 10_000 })

  // Spot-check one table name from each group — these only exist in the stats content area
  await expect(page.getByText('Brands')).toBeVisible()     // Catalog
  await expect(page.getByText('Libraries')).toBeVisible()  // Session
  await expect(page.getByText('Workflow')).toBeVisible()   // Tools
  await expect(page.getByText('Tag Types')).toBeVisible()  // Config
})

test('stats page shows a non-zero total', async ({ page }) => {
  await page.goto('/controlroom/admin/stats')

  // Wait for data to load
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible({ timeout: 10_000 })

  // The Total label must be present
  await expect(page.getByText('Total')).toBeVisible()

  // The total must be a number greater than zero
  const totalRow = page.locator('div').filter({ hasText: /^Total/ }).last()
  const countText = await totalRow.locator('span.font-mono').textContent()
  const count = Number.parseInt((countText ?? '0').replaceAll(',', ''), 10)
  expect(count).toBeGreaterThan(0)
})
