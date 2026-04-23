import { test, expect } from '@playwright/test'

const TABLES = [
  '/studio/catalog/brands',
  '/studio/catalog/models',
  '/controlroom/session/instruments',
  '/controlroom/session/effects',
  '/controlroom/session/libraries',
  '/controlroom/session/workstations',
  '/controlroom/tools/admin',
  '/controlroom/tools/composition',
  '/controlroom/tools/measurement',
  '/controlroom/tools/reference',
  '/controlroom/tools/workflow',
  '/studio/config/effect-types',
  '/studio/config/entity-types',
  '/studio/config/instrument-types',
  '/studio/config/model-types',
  '/studio/config/plugin-formats',
  '/studio/config/tag-types',
  '/studio/config/tool-types',
]

for (const path of TABLES) {
  test(`loads ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })
  })
}
