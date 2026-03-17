import { test, expect } from '@playwright/test'

interface TableSpec {
  name: string
  path: string
  nameLabel: RegExp
}

const ALL_TABLES: TableSpec[] = [
  { name: 'brand',            path: '/catalog/brands',        nameLabel: /legal name/i        },
  { name: 'model',            path: '/catalog/models',        nameLabel: /model name/i        },
  { name: 'effect',           path: '/session/effects',       nameLabel: /effect name/i       },
  { name: 'instrument',       path: '/session/instruments',   nameLabel: /instrument name/i   },
  { name: 'library',          path: '/session/libraries',     nameLabel: /library name/i      },
  { name: 'workstation',      path: '/session/workstations',  nameLabel: /tool name/i         },
  { name: 'admin tool',       path: '/tools/admin',           nameLabel: /tool name/i         },
  { name: 'composition tool', path: '/tools/composition',     nameLabel: /tool name/i         },
  { name: 'measurement tool', path: '/tools/measurement',     nameLabel: /tool name/i         },
  { name: 'reference tool',   path: '/tools/reference',       nameLabel: /tool name/i         },
  { name: 'workflow tool',    path: '/tools/workflow',        nameLabel: /tool name/i         },
  { name: 'config effect-types',     path: '/config/effect-types',     nameLabel: /^name/i },
  { name: 'config entity-types',     path: '/config/entity-types',     nameLabel: /^name/i },
  { name: 'config instrument-types', path: '/config/instrument-types', nameLabel: /^name/i },
  { name: 'config model-types',      path: '/config/model-types',      nameLabel: /^name/i },
  { name: 'config plugin-formats',   path: '/config/plugin-formats',   nameLabel: /^name/i },
  { name: 'config tag-types',        path: '/config/tag-types',        nameLabel: /^name/i },
  { name: 'config tool-types',       path: '/config/tool-types',       nameLabel: /^name/i },
]

for (const table of ALL_TABLES) {
  test(`${table.name}: create and delete`, async ({ page }) => {
    const testName = `__e2e__${table.name.replaceAll(/\s+/g, '_')}_${Date.now()}`

    await page.goto(table.path)

    // Create
    await page.getByRole('button', { name: /^add$/i }).click()
    await page.getByLabel(table.nameLabel).fill(testName)
    await page.getByRole('button', { name: /^save$/i }).click()

    // Wait for modal to close (confirms save succeeded)
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8000 })

    // Confirm row appears (use search to filter to it)
    await page.getByPlaceholder('Search...').fill(testName)
    await expect(page.getByText(testName).first()).toBeVisible({ timeout: 8000 })

    // Open record and delete
    await page.getByText(testName).first().click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await page.getByRole('button', { name: /confirm delete/i }).click()

    // Wait for modal to close (confirms delete succeeded)
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8000 })

    // Confirm row is gone
    await expect(page.getByText(testName).first()).not.toBeVisible({ timeout: 5000 })
  })
}
