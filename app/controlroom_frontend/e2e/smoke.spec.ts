import { test, expect } from '@playwright/test'

const TABLES = [
  '/catalog/brands',
  '/catalog/models',
  '/session/instruments',
  '/session/effects',
  '/session/libraries',
  '/session/workstations',
  '/tools/admin',
  '/tools/composition',
  '/tools/measurement',
  '/tools/reference',
  '/tools/workflow',
  '/config/effect-types',
  '/config/entity-types',
  '/config/instrument-types',
  '/config/model-types',
  '/config/plugin-formats',
  '/config/tag-types',
  '/config/tool-types',
]

for (const path of TABLES) {
  test(`loads ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })
  })
}
