import { test as setup, expect } from '@playwright/test'
import * as fs from 'node:fs'

setup('authenticate', async ({ page }) => {
  fs.mkdirSync('e2e/.auth', { recursive: true })
  await page.goto('/')
  await page.getByLabel(/username/i).fill('admin')
  await page.getByLabel(/password/i).fill('admin')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/login/)
  await page.context().storageState({ path: 'e2e/.auth/state.json' })
})
