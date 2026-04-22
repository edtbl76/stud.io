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
  '/controlroom/config/effect-types',
  '/controlroom/config/entity-types',
  '/controlroom/config/instrument-types',
  '/controlroom/config/model-types',
  '/controlroom/config/plugin-formats',
  '/controlroom/config/tag-types',
  '/controlroom/config/tool-types',
]

for (const path of TABLES) {
  test(`loads ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })
  })
}
