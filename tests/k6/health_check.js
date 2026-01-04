import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple health check test
export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BACKEND_URL || 'http://127.0.0.1:8109';

export default function () {
  const response = http.get(`${BASE_URL}/health`);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(0.5);
}
