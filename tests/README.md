# Load Testing Suite

This folder contains load/stress testing scripts for the AI Verification system.

## Prerequisites

1. **k6** - Install k6 for API load testing:
   ```bash
   # Linux (Debian/Ubuntu)
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6

   # Or via Docker (no install needed)
   docker run --rm -i loadimpact/k6 run - <script.js
   ```

2. **Backend running** at `http://127.0.0.1:8109`
3. **Model file** present at `backend/models/best4.pt`

## Test Scripts

| Script | Description |
|--------|-------------|
| `k6/load_test.js` | Main k6 load test for `/detect` endpoint |
| `k6/health_check.js` | Simple health endpoint test |
| `payloads/sample_image.json` | Sample base64 image payload |

## Running Tests

### Quick Start (20 users)
```bash
cd tests
k6 run k6/load_test.js
```

### Custom User Count
```bash
# 10 users for 1 minute
k6 run --vus 10 --duration 1m k6/load_test.js

# 50 users for 2 minutes
k6 run --vus 50 --duration 2m k6/load_test.js

# 100 users for 30 seconds
k6 run --vus 100 --duration 30s k6/load_test.js
```

### Using Docker
```bash
docker run --rm -i --network host -v $(pwd):/scripts loadimpact/k6 run /scripts/k6/load_test.js
```

## Interpreting Results

- **http_req_duration**: Response time (p50, p95, p99)
- **http_req_failed**: Error rate (should be 0%)
- **http_reqs**: Total requests per second
- **checks**: Pass/fail assertions

## Thresholds

Default thresholds in `load_test.js`:
- p(95) latency < 2000ms
- Error rate < 1%
