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
