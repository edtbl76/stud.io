// Shared k6 SLO thresholds for all perf scripts.
// p95 < 500ms and error rate < 1% across all endpoints.
export const THRESHOLDS = {
  http_req_duration: ['p(95)<500'],
  http_req_failed: ['rate<0.01'],
}

export const STAGES = [
  { duration: '10s', target: 10 },  // ramp up
  { duration: '30s', target: 10 },  // hold
  { duration: '5s',  target: 0  },  // ramp down
]

export const BASE_URL = __ENV.BACKEND_URL || 'http://localhost:5150'
