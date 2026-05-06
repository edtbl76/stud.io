import { test, expect } from '@playwright/test'

const BASE = '/studio/admin/plugin-scanner'

test('plugin scanner page loads without error', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByTestId('plugin-scanner-page')).toBeVisible({ timeout: 10000 })
})

test('plugin scanner appears in admin sidebar', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('link', { name: 'Plugin Scanner' })).toBeVisible({ timeout: 10000 })
})

test('API key manager renders', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByTestId('api-key-manager')).toBeVisible({ timeout: 10000 })
})

test('generate key button is visible', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByTestId('generate-key-button')).toBeVisible({ timeout: 10000 })
})

test('show revoked toggle is visible', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByTestId('show-revoked-toggle')).toBeVisible({ timeout: 10000 })
})
