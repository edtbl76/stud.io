/**
 * Lighthouse audits for every user-facing page.
 *
 * Performance thresholds (Google "Good" band):
 *   LCP  < 2500ms  — Largest Contentful Paint (warn); < 4000ms (hard fail)
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
 *     CARBON_BASE_URL=https://your-app.example.com roadie test perf
 *
 * Requires playwright.perf.config.ts (--remote-debugging-port=9222, workers=1).
 * Run via: roadie test perf
 */
import * as fs from 'fs'
import { test, expect, TestInfo, Browser } from '@playwright/test'
import { playAudit } from 'playwright-lighthouse'
import { co2 } from '@tgwf/co2'

const LIGHTHOUSE_PORT = 9222

const LCP_WARN_MS  = 2500   // Google "Good" band upper bound — annotation threshold
const LCP_FAIL_MS  = 4000   // Hard gate — above this fails the build
const TBT_FAIL_MS  = 200
const CLS_FAIL     = 0.1
const carbonModel = new co2({ model: 'swd' })

// Auth cookies from the setup step. Restored before each audit because
// Lighthouse clears browser storage in its error-path cleanup (NO_FCP etc.),
// which would log out every page after the first failure.
// Read in beforeAll (not at module level) so Playwright's setup project can
// create the file before it is accessed.
let AUTH_COOKIES: ReturnType<typeof JSON.parse>
test.beforeAll(() => {
  AUTH_COOKIES = JSON.parse(fs.readFileSync('e2e/.auth/state.json', 'utf8')).cookies
})

const PAGES = [
  '/search',
  '/studio/catalog/brands',
  '/studio/catalog/models',
  '/controlroom/session/effects',
  '/controlroom/session/instruments',
  '/controlroom/session/libraries',
  '/controlroom/session/workstations',
  '/controlroom/tools/workflow',
  '/controlroom/tools/admin',
  '/controlroom/tools/composition',
  '/controlroom/tools/measurement',
  '/controlroom/tools/reference',
  '/controlroom/scanner/workbench',
  '/studio/config/effect-types',
  '/studio/config/entity-types',
  '/studio/config/instrument-types',
  '/studio/config/model-types',
  '/studio/config/plugin-formats',
  '/studio/config/tag-types',
  '/studio/config/tool-types',
  '/studio/admin/change-review',
  '/studio/admin/plugin-scanner',
  '/studio/admin/users',
  '/studio/admin/stats',
  '/studio/admin/backup',
  '/studio/admin/import-export',
  '/gearlist/guitars',
  '/gearlist/other-gear',
  '/studio/config/gear-types',
]

function pct(score: number | null | undefined): string {
  return score != null ? `${Math.round(score * 100)}%` : 'n/a'
}

// Inject cookies into the browser's default context (used by Lighthouse via CDP).
// Lighthouse navigates independently of the Playwright isolated context, so
// page.context().addCookies() alone is insufficient.
async function seedLighthouseCookies(browser: Browser): Promise<void> {
  const cdp = await browser.newBrowserCDPSession()
  await cdp.send('Storage.setCookies', { cookies: AUTH_COOKIES })
  await cdp.detach()
}

for (const path of PAGES) {
  test(`Lighthouse: ${path}`, async ({ page, browser }, testInfo: TestInfo) => {
    await page.context().addCookies(AUTH_COOKIES)
    await seedLighthouseCookies(browser)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const result = await playAudit({
      page,
      port: LIGHTHOUSE_PORT,
      // Only enforce performance — passing accessibility/best-practices here
      // changes onlyCategories and breaks headless paint capture (NO_FCP).
      thresholds: { performance: 0 },
      // Run all three categories so scores are available as annotations.
      opts: { onlyCategories: ['performance', 'accessibility', 'best-practices'] },
      reports: {
        formats: { html: true },
        directory: 'perf-reports/lighthouse',
        name: path.replace(/\//g, '_').replace(/^_/, '') || 'home',
      },
    })

    const audits     = result.lhr.audits
    const categories = result.lhr.categories

    // ── Lighthouse runtime error (diagnostic) ────────────────────────────
    // Populated when Lighthouse itself fails: NO_FCP, PAGE_HUNG,
    // FAILED_DOCUMENT_REQUEST, etc. Always annotate so CI logs show why.
    const runtimeError = result.lhr.runtimeError
    if (runtimeError?.code) {
      testInfo.annotations.push({
        type: 'lighthouse-runtime-error',
        description: `${runtimeError.code}: ${runtimeError.message}`,
      })
    }

    // ── Core Web Vitals (enforced) ────────────────────────────────────────
    const fcp = audits['first-contentful-paint']?.numericValue ?? Infinity
    const lcp = audits['largest-contentful-paint']?.numericValue ?? Infinity
    const tbt = audits['total-blocking-time']?.numericValue ?? Infinity
    const cls = audits['cumulative-layout-shift']?.numericValue ?? Infinity

    // Always annotate FCP — helps distinguish "nothing painted" (FCP=Infinity)
    // from "LCP element never appeared" (FCP ok, LCP=Infinity).
    testInfo.annotations.push({
      type: 'fcp',
      description: fcp === Infinity ? 'NO_FCP (nothing painted)' : `${(fcp / 1000).toFixed(2)}s`,
    })

    if (lcp >= LCP_WARN_MS && lcp < LCP_FAIL_MS) {
      testInfo.annotations.push({
        type: 'lcp-warning',
        description: `LCP for ${path} is ${(lcp / 1000).toFixed(2)}s — above 2.5s target, check HTML report`,
      })
      const warnFile = process.env.PERF_LCP_WARNING_FILE
      if (warnFile) fs.appendFileSync(warnFile, `${path}: ${(lcp / 1000).toFixed(2)}s\n`)
    }

    if (lcp >= LCP_FAIL_MS) {
      const screenshot = await page.screenshot({ fullPage: false })
      await testInfo.attach('screenshot-at-failure', { body: screenshot, contentType: 'image/png' })
    }

    expect(lcp, `LCP for ${path} (${(lcp / 1000).toFixed(2)}s)`).toBeLessThan(LCP_FAIL_MS)
    expect(tbt, `TBT for ${path} (${tbt.toFixed(0)}ms)`).toBeLessThan(TBT_FAIL_MS)
    expect(cls, `CLS for ${path} (${cls.toFixed(3)})`).toBeLessThan(CLS_FAIL)

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
