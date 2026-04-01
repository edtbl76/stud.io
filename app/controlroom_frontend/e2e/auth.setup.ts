import { test as setup } from '@playwright/test'
import * as fs from 'node:fs'

setup('authenticate', async ({ page }) => {
  fs.mkdirSync('e2e/.auth', { recursive: true })
  // Navigate first to establish the origin, then authenticate via the API
  // directly. The production server renders null while the auth check is
  // pending, so UI-based login is unreliable in the perf (next start) context.
  await page.goto('/')
  await page.evaluate(async () => {
    const form = new URLSearchParams()
    form.append('username', 'admin')
    form.append('password', 'admin')
    await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  })
  await page.context().storageState({ path: 'e2e/.auth/state.json' })
})
