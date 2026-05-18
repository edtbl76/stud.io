import { test, expect, type Page } from '@playwright/test'

/** Waits for the record count label — only rendered after React hydrates and data loads. */
async function waitForRows(page: Page) {
  await expect(page.getByText(/\d+ records?/)).toBeVisible({ timeout: 30_000 })
}

interface TableSpec {
  name: string
  path: string
}

const ALL_TABLES: TableSpec[] = [
  { name: 'brand',                   path: '/studio/catalog/brands'              },
  { name: 'model',                   path: '/studio/catalog/models'              },
  { name: 'effect',                  path: '/controlroom/session/effects'             },
  { name: 'instrument',              path: '/controlroom/session/instruments'         },
  { name: 'library',                 path: '/controlroom/session/libraries'           },
  { name: 'workstation',             path: '/controlroom/session/workstations'        },
  { name: 'admin tool',              path: '/controlroom/tools/admin'                 },
  { name: 'composition tool',        path: '/controlroom/tools/composition'           },
  { name: 'measurement tool',        path: '/controlroom/tools/measurement'           },
  { name: 'reference tool',          path: '/controlroom/tools/reference'             },
  { name: 'workflow tool',           path: '/controlroom/tools/workflow'              },
  { name: 'config effect-types',     path: '/studio/config/effect-types'        },
  { name: 'config entity-types',     path: '/studio/config/entity-types'        },
  { name: 'config instrument-types', path: '/studio/config/instrument-types'    },
  { name: 'config model-types',      path: '/studio/config/model-types'         },
  { name: 'config plugin-formats',   path: '/studio/config/plugin-formats'      },
  { name: 'config tag-types',        path: '/studio/config/tag-types'           },
  { name: 'config tool-types',       path: '/studio/config/tool-types'          },
]

for (const table of ALL_TABLES) {
  test(`${table.name}: row click opens and closes modal`, async ({ page }) => {
    await page.goto(table.path)

    // Wait for hydration before clicking — row clicks require React to be attached
    await waitForRows(page)
    const firstRow = page.locator('table tbody tr').first()

    // Click the last cell — always a data column, never the checkbox (which is always first)
    await firstRow.locator('td').last().click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

    // Close the modal
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
  })
}

// ---------------------------------------------------------------------------
// Config dropdown population (regression: /studio/config path)
// ---------------------------------------------------------------------------

test('model create modal: Model Types dropdown is populated', async ({ page }) => {
  await page.goto('/studio/catalog/models')
  await waitForRows(page)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /select model types/i }).click()
  await expect(page.getByText('No options available')).not.toBeVisible({ timeout: 5_000 })
})

// ---------------------------------------------------------------------------
// Plugin Paths section (U-07: disk_paths on catalog records)
// ---------------------------------------------------------------------------

test('effect modal shows Plugin Paths section', async ({ page }) => {
  await page.goto('/controlroom/session/effects')
  await waitForRows(page)
  await page.locator('table tbody tr').first().locator('td').last().click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Plugin Paths')).toBeVisible({ timeout: 10_000 })
})

test('effect modal: disk_paths entry persists after save and reload', async ({ page }) => {
  const TEST_PATH = '/tmp/e2e-test-plugin.vst3'

  await page.goto('/controlroom/session/effects')
  await waitForRows(page)

  const firstRow = page.locator('table tbody tr').first()
  const dialog = page.getByRole('dialog')

  await firstRow.locator('td').last().click()
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /edit/i }).click()

  // Add entry — use last() to append after any pre-existing entries
  await page.getByTestId('plugin-paths-add').click()
  await page.locator('[data-testid^="plugin-paths-path-"]').last().fill(TEST_PATH)

  await page.getByRole('button', { name: /^save$/i }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })

  // Reopen the same record and verify the path survived the round-trip
  await waitForRows(page)
  await firstRow.locator('td').last().click()
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  // Path is stored in a readonly <input> — use toHaveValue, not getByText
  await expect(page.locator('[data-testid^="plugin-paths-path-"]').last()).toHaveValue(TEST_PATH, { timeout: 10_000 })
})
