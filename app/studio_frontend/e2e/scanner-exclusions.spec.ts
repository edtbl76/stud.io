import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/exclusions'

test('exclusions page loads without error', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const hasRows = await page.locator('[data-testid="exclusion-row"]').count()
  const hasEmpty = await page.locator('[data-testid="exclusions-empty-state"]').count()
  expect(hasRows + hasEmpty).toBeGreaterThan(0)
})

test('each exclusion row has a remove button', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const rows = page.locator('[data-testid="exclusion-row"]')
  const count = await rows.count()
  if (count > 0) {
    const firstRow = rows.first()
    await expect(firstRow.locator('button')).toBeVisible()
  } else {
    test.info().annotations.push({ type: 'note', description: 'No exclusion rows in test environment' })
  }
})
