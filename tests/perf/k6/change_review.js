/**
 * k6 load test — change review (audit log) endpoints.
 *
 * Tests the paginated audit log list and single-entry detail under load.
 * Read-only: only GET endpoints.
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
  const token = res.json('access_token')
  const headers = { Authorization: `Bearer ${token}` }

  // Fetch one audit_id for the detail endpoint test.
  const listRes = http.get(`${BASE_URL}/studio/admin/change-review?status=all&page_size=1`, { headers })
  const entries = listRes.json('entries')
  const auditId = (entries && entries.length > 0) ? entries[0].audit_id : null
  return { token, auditId }
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` }

  group('audit log list — pending', () => {
    const res = http.get(`${BASE_URL}/studio/admin/change-review`, { headers })
    check(res, {
      'list status 200':   (r) => r.status === 200,
      'list has entries':  (r) => Array.isArray(r.json('entries')),
    })
  })

  group('audit log list — all statuses', () => {
    for (const status of ['pending', 'acknowledged', 'undone', 'all']) {
      const res = http.get(`${BASE_URL}/studio/admin/change-review?status=${status}`, { headers })
      check(res, { [`list?status=${status} 200`]: (r) => r.status === 200 })
    }
  })

  group('audit log list — paginated', () => {
    const res = http.get(`${BASE_URL}/studio/admin/change-review?status=all&page=1&page_size=20`, { headers })
    check(res, { 'page 1 status 200': (r) => r.status === 200 })
  })

  group('audit log detail', () => {
    if (!data.auditId) return
    const res = http.get(`${BASE_URL}/studio/admin/change-review/${data.auditId}`, { headers })
    check(res, { 'detail status 200': (r) => r.status === 200 })
  })
}
