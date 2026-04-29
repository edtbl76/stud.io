import { test, expect, type Page } from '@playwright/test'

async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

test('guitars page loads and shows table', async ({ page }) => {
  await page.goto('/gearlist/guitars')
  await waitForRows(page)
  await expect(page.getByRole('heading', { name: /guitars/i })).toBeVisible()
})

test('other gear page loads and shows table', async ({ page }) => {
  await page.goto('/gearlist/other-gear')
  await waitForRows(page)
  await expect(page.getByRole('heading', { name: /other gear/i })).toBeVisible()
})

test('gear types config page loads', async ({ page }) => {
  await page.goto('/studio/config/gear-types')
  await expect(page.getByRole('heading', { name: /gear types/i })).toBeVisible({ timeout: 15_000 })
})

test('GearList sidebar renders Guitars and Other Gear links', async ({ page }) => {
  await page.goto('/gearlist/guitars')
  await expect(page.getByRole('link', { name: 'Guitars' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Other Gear' })).toBeVisible()
})

test('ModuleSwitcher shows GearList link from ControlRoom', async ({ page }) => {
  await page.goto('/controlroom/session/effects')
  await expect(page.getByRole('link', { name: /gearlist/i })).toBeVisible()
})

test('can open create gear modal', async ({ page }) => {
  await page.goto('/gearlist/guitars')
  await waitForRows(page)
  await page.getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('New Gear')).toBeVisible()
})

async function createGearViaModal(page: Page, name: string, typeLabel?: string) {
  await page.getByRole('button', { name: /^add$/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByLabel(/^name/i).fill(name)
  if (typeLabel) {
    // Wait for gear types to load before selecting
    await expect(page.locator('#gear_type_id option').nth(1)).toBeAttached({ timeout: 10_000 })
    await page.locator('#gear_type_id').selectOption({ label: typeLabel })
  }
  await page.getByRole('button', { name: /^save$/i }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
  // Reload so the virtualizer measures the scroll container before rendering rows
  await page.reload()
  await waitForRows(page)
  await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 })
}

test('can open gear detail modal by clicking a row', async ({ page }) => {
  // Use Other Gear (unfiltered) so no type selection is needed
  await page.goto('/gearlist/other-gear')
  await waitForRows(page)
  await createGearViaModal(page, 'E2E Row Click Gear')
  await page.getByText('E2E Row Click Gear').click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
})

test('guitar modal shows edit mode with pickup config select', async ({ page }) => {
  await page.goto('/gearlist/guitars')
  await waitForRows(page)
  await createGearViaModal(page, 'E2E Pickup Config Guitar', 'Guitar')
  await page.getByText('E2E Pickup Config Guitar').click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /^edit$/i }).click()
  await expect(page.locator('#pickup_config')).toBeVisible({ timeout: 5_000 })
})
