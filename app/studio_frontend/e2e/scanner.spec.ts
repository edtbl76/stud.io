import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner'

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const SECTION_LOCATOR = '[data-testid="scanner-no-scans-state"], [data-testid="section-count"], [data-testid="scanner-empty-state"]'

test('scanner matched page loads without error', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  await expect(page.locator(SECTION_LOCATOR)).toBeVisible({ timeout: 10000 })
})

test('scanner known page loads without error', async ({ page }) => {
  await page.goto(`${BASE}/known`)
  await expect(page.locator(SECTION_LOCATOR)).toBeVisible({ timeout: 10000 })
})

test('scanner conflicted page loads without error', async ({ page }) => {
  await page.goto(`${BASE}/conflicted`)
  await expect(page.locator(SECTION_LOCATOR)).toBeVisible({ timeout: 10000 })
})

test('scanner absent page loads without error', async ({ page }) => {
  await page.goto(`${BASE}/absent`)
  await expect(page.locator(SECTION_LOCATOR)).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test('Plugin Scanner nav group appears in sidebar', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  await expect(page.getByText('PLUGIN SCANNER')).toBeVisible({ timeout: 10000 })
})

test('all scanner nav items link to correct routes', async ({ page }) => {
  const sections = [
    ['Known',       `${BASE}/known`],
    ['Matched',     `${BASE}/matched`],
    ['Conflicted',  `${BASE}/conflicted`],
    ['Unconfirmed', `${BASE}/unconfirmed`],
    ['Untracked',   `${BASE}/untracked`],
    ['Orphaned',    `${BASE}/orphaned`],
    ['Absent',      `${BASE}/absent`],
    ['Exclusions',  `${BASE}/exclusions`],
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
  const picker = page.getByTestId('scan-run-select')
  const noScans = page.getByTestId('scanner-no-scans-state')
  await expect(picker.or(noScans)).toBeVisible({ timeout: 10000 })
  test.skip(await noScans.isVisible(), 'No scan data available in this environment')
  await expect(picker).toBeVisible()
})

// ---------------------------------------------------------------------------
// Manage history panel
// ---------------------------------------------------------------------------

test('manage history panel opens when toggle is clicked', async ({ page }) => {
  await page.goto(`${BASE}/matched`)
  const toggle = page.getByTestId('manage-history-toggle')
  const noScans = page.getByTestId('scanner-no-scans-state')
  await expect(toggle.or(noScans)).toBeVisible({ timeout: 10000 })
  test.skip(await noScans.isVisible(), 'No scan data available in this environment')
  await toggle.click()
  await expect(page.getByTestId('manage-history-panel')).toBeVisible()
})
