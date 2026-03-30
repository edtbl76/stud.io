/**
 * k6 load test — catalog list endpoints.
 *
 * Tests all paginated entity list endpoints under concurrent load.
 * Read-only: no mutations.
 */
import http from 'k6/http'
import { check, group } from 'k6'
import { THRESHOLDS, STAGES, BASE_URL } from './thresholds.js'

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      stages: STAGES,
    },
  },
  thresholds: THRESHOLDS,
}

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/token`,
    'username=admin&password=admin',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  check(res, { 'auth succeeded': (r) => r.status === 200 })
  return { token: res.json('access_token') }
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` }

  group('catalog entities', () => {
    const endpoints = [
      '/brands',
      '/models',
      '/effects',
      '/instruments',
      '/libraries',
      '/workstations',
    ]
    for (const path of endpoints) {
      const res = http.get(`${BASE_URL}${path}`, { headers })
      check(res, {
        [`${path} status 200`]: (r) => r.status === 200,
        [`${path} has items`]:   (r) => Array.isArray(r.json('items')),
      })
    }
  })

  group('config lookup tables', () => {
    const slugs = [
      'effect-types',
      'entity-types',
      'instrument-types',
      'model-types',
      'plugin-formats',
      'tag-types',
      'tool-types',
    ]
    for (const slug of slugs) {
      const res = http.get(`${BASE_URL}/config/${slug}`, { headers })
      check(res, { [`/config/${slug} status 200`]: (r) => r.status === 200 })
    }
  })

  group('catalog with filters', () => {
    const res = http.get(`${BASE_URL}/brands?filter_brand_name=pro`, { headers })
    check(res, { 'filtered brands status 200': (r) => r.status === 200 })
  })
}
