import { test, expect } from '@playwright/test'

test('brand typeahead shows create option for unknown brand', async ({ page }) => {
  await page.goto('/session/instruments')
  await page.getByRole('button', { name: /^add$/i }).click()

  const brandInput = page.getByPlaceholder(/search brands/i)
  await brandInput.click()
  await brandInput.fill('__e2e_brand_typeahead_nonexistent__')

  // Dropdown should show a Create option for the unknown brand
  await expect(page.getByRole('button', { name: /create/i })).toBeVisible({ timeout: 5000 })
})
