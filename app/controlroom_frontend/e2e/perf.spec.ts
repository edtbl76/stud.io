/**
 * Lighthouse Core Web Vitals audits for every user-facing page.
 *
 * Thresholds (Google "Good" band):
 *   LCP  < 2500ms  — Largest Contentful Paint
 *   TBT  < 200ms   — Total Blocking Time
 *   CLS  < 0.1     — Cumulative Layout Shift
 *
 * Requires playwright.perf.config.ts (--remote-debugging-port=9222, workers=1).
 * Run via: ./scripts/test-perf.sh
 */
import { test, expect } from '@playwright/test'
import { playAudit } from 'playwright-lighthouse'

const LIGHTHOUSE_PORT = 9222

const PAGES = [
  '/',
  '/search',
  '/catalog/brands',
  '/catalog/models',
  '/session/effects',
  '/session/instruments',
  '/session/libraries',
  '/session/workstations',
  '/tools/workflow',
  '/tools/admin',
  '/tools/composition',
  '/tools/measurement',
  '/tools/reference',
  '/config/effect-types',
  '/config/entity-types',
  '/config/instrument-types',
  '/config/model-types',
  '/config/plugin-formats',
  '/config/tag-types',
  '/config/tool-types',
  '/admin/change-review',
  '/admin/users',
  '/admin/stats',
  '/admin/backup',
  '/admin/import-export',
]

for (const path of PAGES) {
  test(`Lighthouse: ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const result = await playAudit({
      page,
      port: LIGHTHOUSE_PORT,
      thresholds: { performance: 0 },  // run performance category; individual metrics checked below
      reports: {
        formats: { html: true },
        directory: 'perf-reports/lighthouse',
        name: path.replace(/\//g, '_').replace(/^_/, '') || 'home',
      },
    })

    const audits = result.lhr.audits
    const lcp = audits['largest-contentful-paint']?.numericValue ?? Infinity
    const tbt = audits['total-blocking-time']?.numericValue ?? Infinity
    const cls = audits['cumulative-layout-shift']?.numericValue ?? Infinity

    expect(lcp, `LCP for ${path} (${(lcp / 1000).toFixed(2)}s)`).toBeLessThan(2500)
    expect(tbt, `TBT for ${path} (${tbt.toFixed(0)}ms)`).toBeLessThan(200)
    expect(cls, `CLS for ${path} (${cls.toFixed(3)})`).toBeLessThan(0.1)
  })
}
