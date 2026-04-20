import { test, expect, type Page } from '@playwright/test'

/** Waits for the record count label — only rendered after React hydrates and data loads. */
async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

test('brand typeahead returns results in create modal', async ({ page }) => {
  // Instruments have a BrandSelect field — use the Add button to open a create modal
  await page.goto('/controlroom/session/instruments')
  await page.getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  const brandInput = page.getByPlaceholder(/search brands/i)
  await expect(brandInput).toBeVisible({ timeout: 10_000 })
  await brandInput.fill('a')

  // Dropdown should show at least one brand result
  await expect(
    page.locator('[role="dialog"]').getByRole('button', { name: /\S/ }).first()
  ).toBeVisible({ timeout: 10_000 })
})

test('brand typeahead shows create option for unknown brand', async ({ page }) => {
  await page.goto('/controlroom/session/instruments')

  // Wait for hydration, then open an existing instrument record
  await waitForRows(page)
  const firstRow = page.locator('table tbody tr').first()
  await firstRow.locator('td').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  // Switch to edit mode and wait for the brand input to be ready
  await page.getByRole('button', { name: /^edit$/i }).click()

  const brandInput = page.getByPlaceholder(/search brands/i)
  await expect(brandInput).toBeVisible({ timeout: 10_000 })
  await brandInput.click()
  await brandInput.fill('__e2e_brand_typeahead_nonexistent__')

  // Dropdown should show a Create option for the unknown brand
  await expect(page.getByRole('button', { name: /create/i })).toBeVisible({ timeout: 10_000 })
})
