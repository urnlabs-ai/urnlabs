# Response Caching Layer - Implementation Guide

## Overview

The Response Caching Layer provides intelligent HTTP response caching with Redis backend, supporting multiple cache strategies, automatic invalidation, and comprehensive performance monitoring.

## Features

### Core Caching Features
- **HTTP Response Caching**: Automatic caching of GET requests based on configurable policies
- **Smart Cache Keys**: Generated from URL, method, headers, and user context
- **TTL Management**: Configurable time-to-live values per endpoint pattern
- **Size-based Filtering**: Automatic exclusion of oversized responses
- **Content-Type Filtering**: Selective caching based on response content types
- **User-aware Caching**: Cache varies by user roles and authorization context

### Advanced Features
- **Cache Policies**: Flexible, pattern-based caching rules with priorities
- **Tag-based Invalidation**: Bulk invalidation using semantic tags
- **Cache Analytics**: Comprehensive performance monitoring and recommendations
- **Health Monitoring**: Real-time cache health status and alerts
- **ETag Support**: Conditional request handling with ETag validation
- **Cache Warming**: Proactive cache population for critical endpoints

### Performance Monitoring
- **Hit/Miss Tracking**: Real-time cache performance metrics
- **Response Time Analysis**: Impact measurement of cache hits vs misses
- **Memory Usage Monitoring**: Redis memory utilization tracking
- **Endpoint-specific Metrics**: Per-URL performance analysis
- **Trend Analysis**: Historical performance data with hourly/daily trends

## Architecture

### Components

1. **CacheManager** (`/src/services/CacheManager.ts`)
   - Core cache operations (get, set, delete)
   - Cache policy management
   - Key generation and validation
   - Tag-based invalidation

2. **CacheAnalytics** (`/src/services/CacheAnalytics.ts`)
   - Performance metrics collection
   - Health monitoring and alerts
   - Trend analysis and reporting
   - Optimization recommendations

3. **CacheMiddleware** (`/src/middleware/cache-middleware.ts`)
   - Fastify middleware integration
   - Request/response interception
   - Conditional request handling
   - Cache header management

4. **Cache Policies** (`/src/config/cache-policies.ts`)
   - Default caching policies
   - Environment-specific configurations
   - Performance targets and thresholds

## Configuration

### Environment Variables

```bash
# Cache Configuration
CACHE_ENABLED=true                    # Enable/disable caching
CACHE_DEFAULT_TTL=300                 # Default TTL in seconds (5 minutes)
CACHE_MAX_SIZE=1048576               # Max response size to cache (1MB)
CACHE_COMPRESSION_ENABLED=true       # Enable response compression

# Redis Configuration
REDIS_URL=redis://localhost:6379     # Redis connection URL
```

### Cache Policies

Cache policies are defined in `/src/config/cache-policies.ts` and include:

- **Pattern Matching**: URL patterns for endpoint identification
- **Conditions**: Method, status code, content type, size, and user role filters
- **TTL Settings**: Custom time-to-live values per policy
- **Vary Headers**: Headers that affect cache key generation
- **Tags**: Semantic tags for bulk invalidation
- **Priority**: Policy precedence when multiple patterns match

Example policy:
```typescript
{
  id: 'api-endpoints',
  name: 'General API Endpoints',
  pattern: '/api/*',
  ttl: 300,
  enabled: true,
  conditions: {
    methods: ['GET'],
    statusCodes: [200, 201, 202],
    contentTypes: ['application/json'],
    maxSize: 1024 * 1024
  },
  varyHeaders: ['authorization', 'user-agent'],
  tags: ['api'],
  priority: 5
}
```

## API Endpoints

### Cache Management

#### Get Cache Statistics
```http
GET /admin/cache/stats
Authorization: Bearer {token}
```

Response includes:
- Cache hit/miss rates
- Memory usage statistics
- Performance analytics
- Health status
- Optimization recommendations

#### Get Cache Health
```http
GET /admin/cache/health
Authorization: Bearer {token}
```

Returns overall cache health status and component-specific health checks.

#### Invalidate Cache by Tags
```http
POST /admin/cache/invalidate/tags
Authorization: Bearer {token}
Content-Type: application/json

{
  "tags": ["user", "profile"]
}
```

#### Invalidate Cache by Pattern
```http
POST /admin/cache/invalidate/pattern
Authorization: Bearer {token}
Content-Type: application/json

{
  "pattern": "/api/users/*"
}
```

#### Clear All Cache
```http
POST /admin/cache/clear
Authorization: Bearer {token}
```

#### Cache Warming
```http
POST /admin/cache/warm
Authorization: Bearer {token}
Content-Type: application/json

{
  "endpoints": [
    { "method": "GET", "url": "/api/health" },
    { "method": "GET", "url": "/metrics" }
  ]
}
```

### Policy Management

#### Get Cache Policies
```http
GET /admin/cache/policies
Authorization: Bearer {token}
```

#### Add Cache Policy
```http
POST /admin/cache/policies
Authorization: Bearer {token}
Content-Type: application/json

{
  "id": "custom-policy",
  "name": "Custom API Cache",
  "pattern": "/api/custom/*",
  "ttl": 600,
  "enabled": true,
  "conditions": {
    "methods": ["GET"],
    "statusCodes": [200]
  },
  "varyHeaders": ["authorization"],
  "tags": ["custom"],
  "priority": 5
}
```

#### Remove Cache Policy
```http
DELETE /admin/cache/policies/{policyId}
Authorization: Bearer {token}
```

### Configuration Management

#### Get Configuration
```http
GET /admin/cache/config
Authorization: Bearer {token}
```

#### Update Configuration
```http
PUT /admin/cache/config
Authorization: Bearer {token}
Content-Type: application/json

{
  "enabled": true,
  "defaultTtl": 300,
  "maxSize": 1048576,
  "debugMode": false
}
```

## Usage Examples

### Testing Cache Functionality

Use the built-in test endpoints to verify cache behavior:

```bash
# Test basic caching
curl -H "Authorization: Bearer {token}" \
     http://localhost:7000/test/cache

# Test with cache bypass
curl -H "Authorization: Bearer {token}" \
     -H "X-Cache-Bypass: true" \
     http://localhost:7000/test/cache

# Test user-specific caching
curl -H "Authorization: Bearer {token}" \
     http://localhost:7000/test/cache/user/123
```

### Monitoring Cache Performance

```bash
# Get comprehensive cache statistics
curl -H "Authorization: Bearer {token}" \
     http://localhost:7000/admin/cache/stats

# Check cache health
curl -H "Authorization: Bearer {token}" \
     http://localhost:7000/admin/cache/health
```

### Cache Headers

The middleware automatically adds cache-related headers:

**Cache Hit:**
```
X-Cache-Status: HIT
X-Cache-Age: 45
ETag: "abc123"
Last-Modified: Wed, 21 Oct 2023 07:28:00 GMT
```

**Cache Miss:**
```
X-Cache-Status: MISS
X-Cache-Key: 8f3a2b1c (debug mode only)
```

**Cache Bypass:**
```
X-Cache-Status: BYPASS
```

## Performance Optimization

### Recommended Practices

1. **Policy Prioritization**: Order policies by specificity (most specific first)
2. **TTL Optimization**: Use shorter TTLs for frequently changing data
3. **Size Limits**: Set appropriate maximum response sizes
4. **Vary Headers**: Minimize vary headers to improve cache efficiency
5. **Tag Strategy**: Use semantic tags for efficient invalidation

### Monitoring and Alerts

The system provides automatic alerts for:
- Low cache hit rates (< 70%)
- High memory usage (> 80%)
- Slow response times (> 200ms)
- Cache thrashing patterns

### Performance Targets

- **Hit Rate**: Target 80%+, Minimum 60%
- **Response Time**: Target <200ms, Maximum 500ms
- **Memory Efficiency**: Target 85%+, Minimum 70%

## Troubleshooting

### Common Issues

**Cache Not Working:**
1. Check Redis connection: `redis://localhost:6379`
2. Verify cache is enabled: `CACHE_ENABLED=true`
3. Check policy patterns match your URLs
4. Ensure response meets caching conditions

**Low Hit Rate:**
1. Review cache policies and TTL values
2. Check for excessive cache invalidation
3. Verify vary headers are appropriate
4. Monitor for cache size limits

**High Memory Usage:**
1. Review cached response sizes
2. Adjust TTL values for less critical data
3. Implement more aggressive invalidation
4. Consider response compression

### Debug Mode

Enable debug mode for detailed cache information:

```typescript
// In configuration
{
  debugMode: true
}
```

Debug mode adds additional headers:
- `X-Cache-Key`: Shortened cache key for identification
- `X-Cache-TTL`: TTL value used for the response

### Health Checks

Monitor cache health through:
1. `/health` endpoint (includes cache status)
2. `/admin/cache/health` endpoint (detailed health check)
3. Redis monitoring tools
4. Application logs

## Development

### Running Tests

```bash
# Start the gateway
npm run dev

# Test caching endpoints
curl http://localhost:7000/test/cache
curl http://localhost:7000/test/cache/heavy
curl http://localhost:7000/test/cache/no-cache
```

### Adding Custom Policies

1. Define policy in `/src/config/cache-policies.ts`
2. Use policy management APIs for runtime updates
3. Test with appropriate endpoints
4. Monitor performance impact

### Extending Analytics

Add custom metrics by extending `CacheAnalytics`:
1. Add new metric collection methods
2. Update performance report generation
3. Implement custom alerting rules
4. Add dashboard visualization

## Security Considerations

### Access Control
- Cache management endpoints require authentication
- Policy management requires admin permissions
- Cache invalidation requires write permissions

### Data Privacy
- User-specific data uses private cache headers
- Sensitive headers are excluded from cache keys
- Authorization context affects cache key generation

### Cache Pollution Prevention
- Size limits prevent large response caching
- Content-type filtering blocks unwanted content
- Status code filtering ensures only successful responses are cached

## Integration with Monitoring

The cache layer integrates with:
- **Prometheus**: Metrics export for monitoring dashboards
- **Grafana**: Performance visualization
- **Slack**: Alert notifications
- **Application Logs**: Detailed operational information

---

For additional information or support, refer to the gateway documentation or contact the platform team.