import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner'

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test('Plugin Scanner nav group appears in sidebar', async ({ page }) => {
  await page.goto(`${BASE}/workbench`)
  await expect(page.getByRole('button', { name: 'PLUGIN SCANNER' })).toBeVisible({ timeout: 10000 })
})

test('scanner nav items link to correct routes', async ({ page }) => {
  const sections = [
    ['Scan Workbench',      `${BASE}/workbench`],
    ['Plugin Scanner Rules', `${BASE}/rules`],
  ] as const

  for (const [label, href] of sections) {
    await page.goto(`${BASE}/workbench`)
    await page.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(href)
  }
})

// ---------------------------------------------------------------------------
// Plugin Scanner Rules page — Steps 49-50
// ---------------------------------------------------------------------------

test('rules page loads and shows all three sections', async ({ page }) => {
  await page.goto(`${BASE}/rules`)
  await expect(page.getByText('Vendor Mappings')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Name Mappings')).toBeVisible()
  await expect(page.getByText('Name Patterns')).toBeVisible()
})

test('Add Rule button in Vendor Mappings opens creation form', async ({ page }) => {
  await page.goto(`${BASE}/rules`)
  const vendorSection = page.locator('section').filter({ hasText: 'Vendor Mappings' })
  await expect(vendorSection).toBeVisible({ timeout: 10000 })
  await vendorSection.getByTestId('rule-section-add-button').click()
  await expect(page.getByTestId('input-disk-vendor')).toBeVisible()
})
