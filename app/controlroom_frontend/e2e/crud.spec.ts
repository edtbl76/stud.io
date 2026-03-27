import { test, expect } from '@playwright/test'

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

    // Wait for at least one data row to appear
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 8000 })

    // Click a data cell (skip td:nth-child(1) which may be a checkbox with stopPropagation)
    await firstRow.locator('td').nth(1).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

    // Close the modal
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  })
}
