import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pendingReviewRate = new Rate('pending_reviews');
const successRate = new Rate('successful_detections');
const responseTime = new Trend('response_time_ms');

// Test configuration - 20 users by default
export const options = {
  vus: 20,              // 20 parallel users
  duration: '1m',       // Run for 1 minute
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    http_req_failed: ['rate<0.01'],     // Less than 1% errors
    errors: ['rate<0.05'],              // Custom error rate under 5%
  },
};

// Backend URL - change if needed
const BASE_URL = __ENV.BACKEND_URL || 'http://127.0.0.1:8109';

// Small test image (1x1 red pixel PNG as base64)
// In production tests, use real card images for accurate results
const SAMPLE_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// Larger sample - 10x10 gradient (more realistic size for testing)
const LARGER_SAMPLE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAKAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUH/8QAIhAAAgIBAwQDAAAAAAAAAAAAAQIDBAAFERIGITFBUWFx/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAZEQACAwEAAAAAAAAAAAAAAAABAgADESH/2gAMAwEAAhEDEEA/AMi1TVdTuJIJrNmWRYolVFZ2YhUUKo5E+gAB2xjFZaiz0mSYAk//2Q==';

export default function () {
  // Prepare payload
  const payload = JSON.stringify({
    front_image: LARGER_SAMPLE,
    back_image: LARGER_SAMPLE,
    force_upload: false,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };

  // Make request to /detect endpoint
  const startTime = new Date().getTime();
  const response = http.post(`${BASE_URL}/detect`, payload, params);
  const endTime = new Date().getTime();

  // Record response time
  responseTime.add(endTime - startTime);

  // Check response
  const isSuccess = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  // Parse response and track metrics
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      
      // Track detection results
      if (body.status === 'success') {
        successRate.add(1);
        errorRate.add(0);
      } else if (body.status === 'pending_review') {
        pendingReviewRate.add(1);
        errorRate.add(0);
      } else {
        errorRate.add(1);
      }

      // Log sample response (only first VU, occasionally)
      if (__VU === 1 && Math.random() < 0.1) {
        console.log(`[VU ${__VU}] Response: ${JSON.stringify(body).substring(0, 200)}...`);
      }
    } catch (e) {
      errorRate.add(1);
    }
  } else {
    errorRate.add(1);
    console.log(`[VU ${__VU}] Error: ${response.status} - ${response.body}`);
  }

  // Random sleep between 0.5 and 1.5 seconds (simulates user think time)
  sleep(Math.random() + 0.5);
}

// Setup function - runs once before test
export function setup() {
  console.log('🚀 Starting load test...');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`👥 Virtual Users: ${options.vus}`);
  console.log(`⏱️  Duration: ${options.duration}`);
  
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    console.error('❌ Backend health check failed! Make sure backend is running.');
    return { healthy: false };
  }
  console.log('✅ Backend is healthy');
  return { healthy: true };
}

// Teardown function - runs once after test
export function teardown(data) {
  console.log('\n📊 Test completed!');
  if (!data.healthy) {
    console.log('⚠️  Backend was not healthy during test');
  }
}
