// Load Test Script for AI Verification Backend with JWT Authentication
// Tests the /detect endpoint with 20 concurrent users
// Uses base64 encoded images as required by main_stateless.py

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

// Load test images at init time (outside default function)
// k6 open() only works during init stage
const frontImageBinary = open('/home/lakshya/Desktop/ai-verification-frontend/public/uploads/123456789/lakshya2.jpeg', 'b');
const backImageBinary = open('/home/lakshya/Desktop/ai-verification-frontend/public/uploads/123456789/lakshy3.jpeg', 'b');

// Convert to base64
const FRONT_IMAGE_BASE64 = encoding.b64encode(frontImageBinary);
const BACK_IMAGE_BASE64 = encoding.b64encode(backImageBinary);

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
    http_req_duration: ['p(95)<5000'],  // 95% of requests under 5s (allow for model processing)
    http_req_failed: ['rate<0.05'],     // Less than 5% transport errors
    errors: ['rate<0.10'],              // Custom error rate under 10%
  },
};

// Configuration
const BASE_URL = __ENV.BACKEND_URL || 'http://127.0.0.1:8109';
const JWT_SECRET = __ENV.JWT_SECRET || '3fPq8sLx9Vh2aZk7QwN1rT6uYb4M0cJvX9eKp5sDf8Gh2Lm1Zq3Ry6Tn0Uv8Wx';

// Base64URL encode helper
function base64urlEncode(str) {
  return encoding.b64encode(str, 'rawurl');
}

// Generate a valid JWT token
function generateJWT(userId) {
  const header = JSON.stringify({
    alg: 'HS256',
    typ: 'JWT'
  });
  
  const payload = JSON.stringify({
    user_id: userId,
    name: `Test User ${userId}`,
    dob: '15-12-2002',
    gender: 'Male',
    password: '',
    iss: 'ai-verification-frontend',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  
  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // HMAC-SHA256 signature
  const signature = crypto.hmac('sha256', JWT_SECRET, signingInput, 'base64rawurl');
  
  return `${signingInput}.${signature}`;
}

export default function () {
  // Generate unique user ID for this iteration
  const userId = `user_${__VU}_${__ITER}_${Date.now()}`;
  const jwtToken = generateJWT(userId);
  
  // Prepare payload matching DetectionRequestBase64 model (main_stateless.py)
  const payload = JSON.stringify({
    user_id: userId,
    front_image: FRONT_IMAGE_BASE64,  // Base64 encoded front image
    back_image: BACK_IMAGE_BASE64,    // Base64 encoded back image
    confidence_threshold: 0.15,
    force_upload: false
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
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
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  // Parse response and track metrics
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      
      if (body.success === true) {
        successRate.add(1);
        errorRate.add(0);
      } else if (body.status === 'pending_review' || body.status === 'needs_review') {
        pendingReviewRate.add(1);
        errorRate.add(0);
      } else {
        errorRate.add(1);
      }

      // Log occasional responses for debugging
      if (__VU === 1 && __ITER % 10 === 0) {
        console.log(`[VU ${__VU}] Response: ${response.body.substring(0, 150)}...`);
      }
    } catch (e) {
      errorRate.add(1);
    }
  } else {
    errorRate.add(1);
    console.log(`[VU ${__VU}] Error: ${response.status} - ${response.body}`);
  }

  // Random sleep between 0.5 and 1.5 seconds
  sleep(Math.random() + 0.5);
}

export function handleSummary(data) {
  console.log('\n📊 Load Test with JWT Authentication Complete!');
  console.log('='.repeat(50));
  return {};
}
