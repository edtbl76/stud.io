import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/known'

test('known page loads without error', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const hasRows = await page.locator('[data-testid="known-row"]').count()
  const hasEmpty = await page.locator('[data-testid="known-empty-state"]').count()
  expect(hasRows + hasEmpty).toBeGreaterThan(0)
})

test('known rows have catalog links with ?open= in href', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const links = page.locator('[data-testid="known-row-link"]')
  const count = await links.count()
  if (count > 0) {
    const href = await links.first().getAttribute('href')
    expect(href).toContain('?open=')
  } else {
    test.info().annotations.push({ type: 'note', description: 'No known rows with catalog links in test environment' })
  }
})
