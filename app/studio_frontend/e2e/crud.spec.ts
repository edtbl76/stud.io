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
  { name: 'brand',                   path: '/catalog/brands'              },
  { name: 'model',                   path: '/catalog/models'              },
  { name: 'effect',                  path: '/session/effects'             },
  { name: 'instrument',              path: '/session/instruments'         },
  { name: 'library',                 path: '/session/libraries'           },
  { name: 'workstation',             path: '/session/workstations'        },
  { name: 'admin tool',              path: '/tools/admin'                 },
  { name: 'composition tool',        path: '/tools/composition'           },
  { name: 'measurement tool',        path: '/tools/measurement'           },
  { name: 'reference tool',          path: '/tools/reference'             },
  { name: 'workflow tool',           path: '/tools/workflow'              },
  { name: 'config effect-types',     path: '/config/effect-types'        },
  { name: 'config entity-types',     path: '/config/entity-types'        },
  { name: 'config instrument-types', path: '/config/instrument-types'    },
  { name: 'config model-types',      path: '/config/model-types'         },
  { name: 'config plugin-formats',   path: '/config/plugin-formats'      },
  { name: 'config tag-types',        path: '/config/tag-types'           },
  { name: 'config tool-types',       path: '/config/tool-types'          },
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
