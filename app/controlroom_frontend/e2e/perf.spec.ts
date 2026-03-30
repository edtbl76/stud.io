/**
 * Lighthouse audits for every user-facing page.
 *
 * Performance thresholds (Google "Good" band):
 *   LCP  < 2500ms  — Largest Contentful Paint
 *   TBT  < 200ms   — Total Blocking Time
 *   CLS  < 0.1     — Cumulative Layout Shift
 *
 * Accessibility:
 *   Lighthouse accessibility score reported per page (WCAG automated checks).
 *   Score is informational — no hard threshold enforced yet. Violations are
 *   visible in the HTML reports under perf-reports/lighthouse/.
 *
 * Best Practices (sustainability proxy):
 *   Lighthouse best-practices score reported per page. Covers efficient resource
 *   loading, no deprecated APIs, optimized images — the same signals that drive
 *   per-page energy consumption. Informational only.
 *
 * CO₂ estimate (local):
 *   Derived from Lighthouse total-byte-weight via the Sustainable Web Design
 *   model (@tgwf/co2). Informational — useful for tracking regressions locally.
 *   For production-accurate data (green hosting, CDN, caching) once the app is
 *   publicly deployed, run:
 *     CARBON_BASE_URL=https://your-app.example.com ./scripts/carbon-report.sh
 *
 * Requires playwright.perf.config.ts (--remote-debugging-port=9222, workers=1).
 * Run via: ./scripts/test-perf.sh
 */
import { test, expect, TestInfo } from '@playwright/test'
import { playAudit } from 'playwright-lighthouse'
import { co2 } from '@tgwf/co2'

const LIGHTHOUSE_PORT = 9222
const carbonModel = new co2({ model: 'swd' })

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

function pct(score: number | null | undefined): string {
  return score != null ? `${Math.round(score * 100)}%` : 'n/a'
}

for (const path of PAGES) {
  test(`Lighthouse: ${path}`, async ({ page }, testInfo: TestInfo) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const result = await playAudit({
      page,
      port: LIGHTHOUSE_PORT,
      thresholds: {
        performance:     0,  // individual metrics asserted below
        accessibility:   0,  // informational — violations visible in HTML report
        'best-practices': 0, // sustainability proxy — informational
      },
      reports: {
        formats: { html: true },
        directory: 'perf-reports/lighthouse',
        name: path.replace(/\//g, '_').replace(/^_/, '') || 'home',
      },
    })

    const audits     = result.lhr.audits
    const categories = result.lhr.categories

    // ── Core Web Vitals (enforced) ────────────────────────────────────────
    const lcp = audits['largest-contentful-paint']?.numericValue ?? Infinity
    const tbt = audits['total-blocking-time']?.numericValue ?? Infinity
    const cls = audits['cumulative-layout-shift']?.numericValue ?? Infinity

    expect(lcp, `LCP for ${path} (${(lcp / 1000).toFixed(2)}s)`).toBeLessThan(2500)
    expect(tbt, `TBT for ${path} (${tbt.toFixed(0)}ms)`).toBeLessThan(200)
    expect(cls, `CLS for ${path} (${cls.toFixed(3)})`).toBeLessThan(0.1)

    // ── Accessibility (informational) ─────────────────────────────────────
    const a11yScore = categories['accessibility']?.score
    testInfo.annotations.push({
      type: 'accessibility',
      description: `Score: ${pct(a11yScore)} — full report: perf-reports/lighthouse/`,
    })

    // ── Best Practices / sustainability proxy (informational) ─────────────
    const bpScore = categories['best-practices']?.score
    testInfo.annotations.push({
      type: 'best-practices (sustainability proxy)',
      description: `Score: ${pct(bpScore)} — covers efficient resources, no deprecated APIs`,
    })

    // ── CO₂ estimate — Sustainable Web Design model (informational) ───────
    const bytes = audits['total-byte-weight']?.numericValue ?? 0
    const co2Grams = carbonModel.perByte(bytes) as number
    testInfo.annotations.push({
      type: 'co2_estimate',
      description: `~${co2Grams.toFixed(4)}g CO₂ per visit (${(bytes / 1024).toFixed(0)} KB transferred) — SWD model, local estimate`,
    })
  })
}
