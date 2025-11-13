# Response Caching Implementation

## Overview
Phase 1 caching implementation for the AI Travel Agents API, focused on caching Amadeus API responses to reduce token usage and improve response times.

## Architecture

### Cache Layer
- **Technology**: Redis 7 (Alpine)
- **Storage**: 256MB max memory with LRU eviction
- **Persistence**: Append-only file (AOF) for durability
- **Client**: Node.js `redis` package

### What's Cached

| Data Type | TTL | Reason |
|-----------|-----|--------|
| **Location Coordinates** | 24 hours | Static data (lat/long rarely changes) |
| **Activities** | 6 hours | Semi-static (tour offerings change infrequently) |
| **Hotels** | 3 hours | Moderate volatility (availability/prices) |
| **Flights** | 1 hour | High volatility (prices change frequently) |

### Cache Key Structure
```
amadeus:{namespace}:{sorted_params}
```

**Examples:**
- `amadeus:location:destination:LONDON`
- `amadeus:activities:lat:51.5074|lon:-0.1278|radius:30`
- `amadeus:flights:adults:2|currency:CAD|departureDate:2025-12-15|destination:BKK|origin:YYZ|returnDate:2025-12-22`

## Implementation Details

### Files Changed

1. **`docker-compose.yml`** (new)
   - Redis service definition
   - Port: 6379
   - Health check configured

2. **`packages/api/src/utils/cache.ts`** (new)
   - Cache utility functions
   - Redis connection management
   - TTL constants
   - Cache statistics

3. **`packages/api/src/genkit/agents/flows.ts`** (modified)
   - Wrapped Amadeus API calls with `withCache()`
   - Applied to: locations, activities, flights, hotels

4. **`packages/api/src/index.ts`** (modified)
   - Initialize Redis on startup
   - Added `/api/cache/stats` endpoint
   - Added `/api/cache/clear` endpoint
   - Updated health check to include cache status

### API Endpoints

#### Cache Statistics
```bash
GET /api/cache/stats
```

**Response:**
```json
{
  "connected": true,
  "keys": 42,
  "memory": "1.23M"
}
```

#### Clear Cache
```bash
DELETE /api/cache/clear?pattern=amadeus:*
```

**Response:**
```json
{
  "cleared": 42,
  "pattern": "amadeus:*"
}
```

#### Health Check (updated)
```bash
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "webSearch": {
    "live": true,
    "keyConfigured": true,
    "cxConfigured": true
  },
  "cache": {
    "connected": true,
    "keys": 42,
    "memory": "1.23M"
  }
}
```

## Usage

### Starting Redis

**With Docker Compose:**
```bash
docker-compose up -d
```

**Standalone Docker:**
```bash
docker run -d --name travel-agent-redis \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server --appendonly yes
```

### Environment Variables

Add to `.env` (optional - defaults to localhost:6379):
```env
REDIS_URL=redis://localhost:6379
```

### Graceful Degradation

If Redis is unavailable:
- ✅ API continues to work normally
- ⚠️ Cache operations are skipped
- ℹ️ Console logs: `⚠ Cache disabled - running without Redis`

No manual intervention needed - the API automatically falls back to direct Amadeus calls.

## Monitoring

### Console Logs

**Cache Hit:**
```
✓ Cache HIT: amadeus:activities:lat:51.5074|lon:-0.1278|radius:30
```

**Cache Miss:**
```
✗ Cache MISS: amadeus:flights:adults:2|currency:CAD|...
✓ Cache SET: amadeus:flights:adults:2|currency:CAD|... (TTL: 3600s)
```

**Connection Events:**
```
✓ Redis connected
✓ Redis ready
```

### Cache Statistics

Check cache performance:
```bash
curl http://localhost:4000/api/cache/stats
```

### Clear Cache (Debug/Dev)

Clear all Amadeus cache:
```bash
curl -X DELETE http://localhost:4000/api/cache/clear
```

Clear specific pattern:
```bash
curl -X DELETE "http://localhost:4000/api/cache/clear?pattern=amadeus:flights:*"
```

## Performance Impact

### Expected Improvements

**Response Time:**
- Cache hit: ~50ms (vs. 2-5 seconds for Amadeus API)
- **Speedup: 40-100x for cached queries**

**Token Usage:**
- Activities/Hotels: 30-50% reduction (high reuse)
- Flights: 10-20% reduction (more unique queries)
- **Overall: 20-40% token savings**

**Cost Savings:**
- Reduced Amadeus API calls
- Lower token consumption
- Redis cost: ~$10/month (managed) or free (self-hosted)

### Cache Hit Rate Expectations

Based on typical travel search patterns:

| Query Type | Expected Hit Rate | Reasoning |
|------------|------------------|-----------|
| Popular destinations (Paris, London, Tokyo) | 60-80% | Many users search same places |
| Seasonal queries (summer Europe, winter Asia) | 40-60% | Temporal clustering |
| Specific dates/origins | 10-30% | More unique combinations |

**Aggregate expected hit rate: 30-50%**

## Troubleshooting

### Redis Not Connecting

1. Check if Redis is running:
   ```bash
   docker ps | grep redis
   ```

2. Test connection:
   ```bash
   docker exec -it travel-agent-redis redis-cli ping
   ```
   Expected output: `PONG`

3. Check logs:
   ```bash
   docker logs travel-agent-redis
   ```

### Cache Not Working

1. Verify Redis connection in API logs:
   ```
   ✓ Redis connected
   ✓ Redis ready
   ```

2. Check cache stats:
   ```bash
   curl http://localhost:4000/api/cache/stats
   ```

3. Monitor console for cache operations:
   ```
   ✓ Cache HIT: ...
   ✗ Cache MISS: ...
   ```

### Memory Issues

If Redis memory is full (maxmemory reached):
- **LRU eviction** automatically removes least recently used keys
- No action needed - cache continues to work
- Consider increasing `maxmemory` in `docker-compose.yml` if hit rate drops

### Stale Data

If users report outdated information:

1. **Immediate fix** - Clear cache:
   ```bash
   curl -X DELETE http://localhost:4000/api/cache/clear
   ```

2. **Long-term fix** - Adjust TTLs in `packages/api/src/utils/cache.ts`:
   ```typescript
   export const CACHE_TTL = {
     ACTIVITIES: 3 * 60 * 60,  // Reduce from 6h to 3h
     HOTELS: 1 * 60 * 60,       // Reduce from 3h to 1h
     FLIGHTS: 30 * 60,          // Reduce from 1h to 30min
     LOCATIONS: 24 * 60 * 60,   // Keep 24h (static data)
   };
   ```

## Next Steps (Phase 2)

Future enhancements (not yet implemented):

1. **Semantic Cache for LLM Responses**
   - Cache destination recommendations for similar queries
   - Requires vector database (Qdrant, Weavius, or pgvector)
   - Embedding model for query similarity

2. **Cache Analytics Dashboard**
   - Hit/miss rates over time
   - Memory usage trends
   - Popular cache keys
   - Cost savings calculator

3. **Intelligent Cache Warming**
   - Pre-cache popular destinations
   - Seasonal pre-loading (summer/winter travel)
   - Background refresh before TTL expiry

4. **User-Triggered Refresh**
   - "Get latest prices" button in UI
   - Cache-busting per query
   - Show cache timestamp to users

5. **Distributed Caching**
   - Redis Cluster for high availability
   - Geographic distribution (CDN-like)
   - Cache replication across regions

## References

- [Redis Documentation](https://redis.io/docs/)
- [Node Redis Client](https://github.com/redis/node-redis)
- [Amadeus API Docs](https://developers.amadeus.com/)
