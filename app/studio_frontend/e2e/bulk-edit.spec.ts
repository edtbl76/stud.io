import { test, expect, type Page } from '@playwright/test'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for the record count text to appear — confirms data has loaded (not just skeleton rows). */
async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

// ── Checkbox visibility ──────────────────────────────────────────────────────

test('bulk edit: checkbox column appears on content tables', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  // Header "Select all" checkbox is present
  await expect(page.getByLabel('Select all')).toBeVisible()
})

test('bulk edit: checkbox column does not appear on config tables', async ({ page }) => {
  await page.goto('/studio/config/tag-types')
  await waitForRows(page)

  await expect(page.getByLabel('Select all')).not.toBeVisible()
})

// ── Selection and bulk edit bar ──────────────────────────────────────────────

test('bulk edit: select-all shows bulk edit bar with count', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByLabel('Select all').click()

  // Bar appears
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  // Count is > 0 (exact number depends on DB state)
  const countText = await page.getByTestId('bulk-edit-bar').locator('span.font-medium').textContent()
  expect(Number(countText)).toBeGreaterThan(0)
})

test('bulk edit: clear button dismisses the bar', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByLabel('Select all').click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  await page.getByLabel('Clear selection').click()
  await expect(page.getByTestId('bulk-edit-bar')).not.toBeVisible({ timeout: 5_000 })
})

test('bulk edit: individual row checkbox selects a single row', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  // Per-row checkboxes are aria-labelled "Select row <id>"
  const rowCheckboxes = page.getByRole('checkbox', { name: /^Select row /i })
  await rowCheckboxes.first().click()

  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })
  const count = await page.getByTestId('bulk-edit-bar').locator('span.font-medium').textContent()
  expect(count).toBe('1')
})

// ── Field picker ─────────────────────────────────────────────────────────────

test('bulk edit: field picker shows correct fields for brands', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)

  await page.getByLabel('Select all').click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  const picker = page.getByLabel('Select field to bulk edit')
  await expect(picker).toBeVisible()

  // Brands has entity_type field
  await expect(picker.locator('option', { hasText: 'Entity Type' })).toHaveCount(1)
})

test('bulk edit: selecting a text field shows a text input', async ({ page }) => {
  await page.goto('/controlroom/session/effects')
  // Search to reduce the dataset before selecting.
  // waitForResponse catches the debounced Absynth-filtered request specifically;
  // waitForLoadState('networkidle') resolves before the 350ms debounce fires and
  // races with the data update, causing Select all to capture stale row IDs.
  const filtered = page.waitForResponse(
    (resp) => resp.url().includes('/effects') && resp.url().includes('Absynth'),
    { timeout: 30_000 },
  )
  await page.getByPlaceholder('2+ chars…').first().fill('Absynth')
  await filtered
  await waitForRows(page)

  await page.getByLabel('Select all').click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  await page.getByLabel('Select field to bulk edit').selectOption({ label: 'Version' })

  await expect(page.getByPlaceholder('Set Version…')).toBeVisible()
})

test('bulk edit: Apply button is disabled until a value is entered', async ({ page }) => {
  await page.goto('/controlroom/session/effects')
  const filtered = page.waitForResponse(
    (resp) => resp.url().includes('/effects') && resp.url().includes('Absynth'),
    { timeout: 30_000 },
  )
  await page.getByPlaceholder('2+ chars…').first().fill('Absynth')
  await filtered
  await waitForRows(page)

  await page.getByRole('checkbox', { name: /^Select row /i }).first().click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  await page.getByLabel('Select field to bulk edit').selectOption({ label: 'Version' })

  // Apply button exists but is disabled before any value
  const applyBtn = page.getByRole('button', { name: /apply/i })
  await expect(page.getByPlaceholder('Set Version…')).toBeVisible()
  await expect(applyBtn).toBeDisabled()

  await page.getByPlaceholder('Set Version…').fill('test-value')
  await expect(applyBtn).not.toBeDisabled()
})

// ── Apply (text field) ───────────────────────────────────────────────────────

test('bulk edit: selecting a single row shows count of 1 in bar', async ({ page }) => {
  await page.goto('/studio/catalog/brands')
  await waitForRows(page)
  await page.getByRole('checkbox', { name: /^Select row /i }).first().click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  const count = await page.getByTestId('bulk-edit-bar').locator('span.font-medium').textContent()
  expect(count).toBe('1')
})

// ── Apply via intercepted PATCH ──────────────────────────────────────────────

test('bulk edit: apply dispatches PATCH requests and clears bar', async ({ page }) => {
  const patches: { url: string; body: Record<string, unknown> }[] = []

  await page.route('**/effects/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      patches.push({ url: route.request().url(), body })
    }
    await route.continue()
  })

  await page.goto('/controlroom/session/effects')
  await waitForRows(page)

  // Select the first row only
  await page.getByRole('checkbox', { name: /^Select row /i }).first().click()
  await expect(page.getByTestId('bulk-edit-bar')).toBeVisible({ timeout: 5_000 })

  // Pick version field and fill a value
  await page.getByLabel('Select field to bulk edit').selectOption({ label: 'Version' })
  await page.getByPlaceholder('Set Version…').fill('0.0.0-e2e')
  await page.getByRole('button', { name: /apply/i }).click()

  // Bar should disappear after apply
  await expect(page.getByTestId('bulk-edit-bar')).not.toBeVisible({ timeout: 10_000 })

  // One PATCH was issued with the right payload
  expect(patches.length).toBe(1)
  expect(patches[0].body).toMatchObject({ version: '0.0.0-e2e' })
})
