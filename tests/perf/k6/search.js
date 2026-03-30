/**
 * k6 load test — cross-entity full-text search endpoint.
 *
 * Tests the most complex query in the app (UNION ALL tsvector across 6 tables)
 * under concurrent load. Read-only.
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

const QUERIES = ['pro', 'synth', 'mix', 'studio', 'plugin', 'eq', 'comp']

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
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)]

  group('full-text search', () => {
    const res = http.get(`${BASE_URL}/search?q=${q}`, { headers })
    check(res, {
      'search status 200':      (r) => r.status === 200,
      'search has results key': (r) => r.json('results') !== undefined,
    })
  })

  group('search with notes', () => {
    const res = http.get(`${BASE_URL}/search?q=${q}&notes=true`, { headers })
    check(res, { 'search+notes status 200': (r) => r.status === 200 })
  })
}
