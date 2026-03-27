import { test, expect } from '@playwright/test'

test('brand typeahead shows create option for unknown brand', async ({ page }) => {
  await page.goto('/session/instruments')

  // Open an existing instrument record (click a data cell to avoid the checkbox column)
  const firstRow = page.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 8000 })
  await firstRow.locator('td').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

  // Switch to edit mode and wait for the brand input to be ready
  await page.getByRole('button', { name: /^edit$/i }).click()

  const brandInput = page.getByPlaceholder(/search brands/i)
  await expect(brandInput).toBeVisible({ timeout: 5000 })
  await brandInput.click()
  await brandInput.fill('__e2e_brand_typeahead_nonexistent__')

  // Dropdown should show a Create option for the unknown brand
  await expect(page.getByRole('button', { name: /create/i })).toBeVisible({ timeout: 5000 })
})
