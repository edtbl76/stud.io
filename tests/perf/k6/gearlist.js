/**
 * k6 load test — GearList backend read endpoints.
 *
 * Tests paginated list endpoints on the Go gearlist service under concurrent load.
 * Read-only: no mutations. No auth required for GET routes.
 */
import http from 'k6/http'
import { check, group } from 'k6'
import { THRESHOLDS, STAGES } from './thresholds.js'

const GEARLIST_URL = __ENV.GEARLIST_URL || 'http://localhost:4001'

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      stages: STAGES,
    },
  },
  thresholds: THRESHOLDS,
}

export default function () {
  group('gear types list', () => {
    const res = http.get(`${GEARLIST_URL}/gear-types`)
    check(res, {
      'GET /gear-types status 200':  (r) => r.status === 200,
      'GET /gear-types is array':    (r) => Array.isArray(r.json()),
    })
  })

  group('gear list', () => {
    const res = http.get(`${GEARLIST_URL}/gear`)
    check(res, {
      'GET /gear status 200':    (r) => r.status === 200,
      'GET /gear has items key': (r) => r.json('items') !== undefined,
    })
  })

  group('gear list with pagination', () => {
    const res = http.get(`${GEARLIST_URL}/gear?limit=10&offset=0`)
    check(res, {
      'GET /gear?limit=10 status 200': (r) => r.status === 200,
    })
  })

  group('gear list with name filter', () => {
    const res = http.get(`${GEARLIST_URL}/gear?name=strat`)
    check(res, {
      'GET /gear?name= status 200': (r) => r.status === 200,
    })
  })

  group('health', () => {
    const res = http.get(`${GEARLIST_URL}/health`)
    check(res, { 'health status 200': (r) => r.status === 200 })
  })
}
