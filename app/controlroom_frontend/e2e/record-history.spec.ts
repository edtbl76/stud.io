import { test, expect } from '@playwright/test'

test('record modal shows History button for existing records', async ({ page }) => {
  await page.goto('/catalog/brands')

  // Wait for the table to load
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

  // Click the first row
  await page.locator('tbody tr').first().click()

  // Modal should open with a History button
  await expect(page.getByRole('button', { name: /^history$/i })).toBeVisible({ timeout: 5_000 })
})

test('clicking History button switches modal to history mode', async ({ page }) => {
  await page.goto('/catalog/brands')

  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('tbody tr').first().click()

  await page.getByRole('button', { name: /^history$/i }).click()

  // Title should contain "— History"
  await expect(page.getByRole('heading', { name: /— History$/i })).toBeVisible({ timeout: 5_000 })
})

test('history mode footer shows only Close button', async ({ page }) => {
  await page.goto('/catalog/brands')

  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('tbody tr').first().click()

  await page.getByRole('button', { name: /^history$/i }).click()

  // Footer Close is the first Close button (the dialog × dismiss button is second)
  await expect(page.getByRole('button', { name: /^close$/i }).first()).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: /^edit$/i })).not.toBeVisible()
  await expect(page.getByRole('button', { name: /^history$/i })).not.toBeVisible()
})

test('history view shows entries or empty state', async ({ page }) => {
  await page.goto('/catalog/brands')

  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('tbody tr').first().click()

  await page.getByRole('button', { name: /^history$/i }).click()

  // Wait for the loading spinner to disappear before asserting on content
  await page.getByText('Loading history...').waitFor({ state: 'hidden', timeout: 15_000 })

  // After loading: entries, empty state, or error — any is a valid rendered state
  await expect(page.locator('[data-testid="history-view-content"]')).toBeVisible({ timeout: 5_000 })
})

test('closing history modal returns to list view', async ({ page }) => {
  await page.goto('/catalog/brands')

  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('tbody tr').first().click()

  await page.getByRole('button', { name: /^history$/i }).click()
  await expect(page.getByRole('heading', { name: /— History$/i })).toBeVisible({ timeout: 5_000 })

  // Footer Close is the first Close button
  await page.getByRole('button', { name: /^close$/i }).first().click()

  // Modal dismissed — table should be visible again
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 5_000 })
})
