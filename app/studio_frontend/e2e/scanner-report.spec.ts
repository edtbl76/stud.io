import { test, expect } from '@playwright/test'

const BASE = '/controlroom/scanner/report'

const mockScans = [
  {
    scan_id: 'scan-e2e-1',
    scanned_at: '2026-05-25T14:32:00.000Z',
    source_machine: "Edward's Mac Studio",
    total_count: 847,
  },
  {
    scan_id: 'scan-e2e-2',
    scanned_at: '2026-05-24T10:00:00.000Z',
    source_machine: "Edward's Mac Studio",
    total_count: 200,
  },
]

const mockReport1 = {
  scan_id: 'scan-e2e-1',
  scanned_at: '2026-05-25T14:32:00.000Z',
  results_by_status: {
    known: [
      {
        result_id: 'r-e2e-1',
        name: 'Surge XT',
        vendor: 'Surge Synth Team',
        version: '3.3.4',
        format: 'VST3',
        path: '/Library/Audio/Plug-Ins/VST3/Surge XT.vst3',
        status: 'known',
        confidence: 'exact',
      },
    ],
    untracked: [],
  },
}

const mockReport2 = {
  scan_id: 'scan-e2e-2',
  scanned_at: '2026-05-24T10:00:00.000Z',
  results_by_status: {
    matched: [],
  },
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/scanner/scans/recent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockScans),
    })
  })

  await page.route('**/api/scanner/scans/scan-e2e-1/report', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport1),
    })
  })

  await page.route('**/api/scanner/scans/scan-e2e-2/report', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReport2),
    })
  })
})

test('scan picker is populated and most recent scan is auto-selected', async ({ page }) => {
  await page.goto(BASE)
  const picker = page.getByRole('combobox', { name: /scan run/i })
  await expect(picker).toBeVisible({ timeout: 10000 })
  await expect(page.locator(`option[value="scan-e2e-1"]`)).toHaveCount(1)
  await expect(page.locator(`option[value="scan-e2e-2"]`)).toHaveCount(1)
})

test('accordion sections are rendered collapsed after page load', async ({ page }) => {
  await page.goto(BASE)
  // Wait for report to load by checking for section headers
  await expect(page.getByRole('button', { name: /known/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /untracked/i })).toBeVisible()
  // No report rows should be visible (all collapsed)
  await expect(page.getByTestId('report-row')).toHaveCount(0)
})

test('expanding a section reveals its rows', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: /known/i })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: /known \(/i }).click()
  await expect(page.getByTestId('report-row')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Surge XT', exact: true })).toBeVisible()
})

test('selecting a different scan loads new report data', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: /known/i })).toBeVisible({ timeout: 10000 })

  const picker = page.getByRole('combobox', { name: /scan run/i })
  await picker.selectOption('scan-e2e-2')

  await expect(page.getByRole('button', { name: /matched/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /known/i })).toHaveCount(0)
})
