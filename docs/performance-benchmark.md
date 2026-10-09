# FoodMesh Performance Benchmark

## Test Environment
- Application: FoodMesh
- Test tool: k6
- Target endpoint: `GET /api/restaurants`
- Request path: API Gateway → Restaurant Service
- Gateway rate limit: 100 requests per minute
- Test type: Local development benchmark

## Baseline Test
- Virtual users: 1
- Duration: 60 seconds
- Total requests: 60
- Successful requests: 60
- Failed requests: 0
- HTTP success rate: 100%
- Average latency: 4.68 ms
- P95 latency: 5.98 ms
- Observed throughput: 0.99 requests/second

## Notes
- All requests returned HTTP 200 during this test.
- These results represent a low-load local benchmark, not maximum system capacity.
- Results may vary with hardware, database state, caching, and background services.
- Higher-load tests encountered HTTP 429 responses from the API Gateway rate limiter.
- Further testing is required before making claims about maximum throughput or production performance.
