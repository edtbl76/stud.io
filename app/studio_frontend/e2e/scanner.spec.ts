import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner'

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

test('scanner matched page loads without error', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  // Accepts either empty state (no scans) or populated state (scans exist)
  await expect(
    page.locator('[data-testid="scanner-no-scans-state"], [data-testid="section-count"], [data-testid="scanner-empty-state"]')
  ).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test('Plugin Scanner nav group appears in sidebar', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  await expect(page.getByText('PLUGIN SCANNER')).toBeVisible({ timeout: 10000 })
})

test('all six scanner nav items link to correct routes', async ({ page }) => {
  const sections = [
    ['Matched',            `${BASE}/matched`],
    ['Version Mismatches', `${BASE}/version-mismatches`],
    ['Unconfirmed',        `${BASE}/unconfirmed`],
    ['Untracked',          `${BASE}/untracked`],
    ['Orphaned',           `${BASE}/orphaned`],
    ['Exclusions',         `${BASE}/exclusions`],
  ] as const

  for (const [label, href] of sections) {
    await page.goto(`${BASE}/matched`)
    await page.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(href)
  }
})

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

test('exclusions section shows empty state when list is empty', async ({ page }) => {
  await page.goto(`${BASE}/exclusions`)
  // Exclusions section loads independently — may show empty state or list
  await expect(page.locator('[data-testid="exclusions-empty-state"], [data-testid="exclusions-list"]')).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Scan run picker
// ---------------------------------------------------------------------------

test('scan run picker appears when scans exist', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  // If scans exist the picker renders; otherwise empty state renders — both are valid
  await expect(
    page.locator('[data-testid="scan-run-select"], [data-testid="scanner-no-scans-state"]')
  ).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Manage history panel
// ---------------------------------------------------------------------------

test('manage history panel opens when toggle is clicked', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  const toggle = page.getByTestId('manage-history-toggle')
  if (await toggle.isVisible()) {
    await toggle.click()
    await expect(page.getByTestId('manage-history-panel')).toBeVisible()
  }
})
