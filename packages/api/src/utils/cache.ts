import { createClient, RedisClientType } from 'redis';
import fs from 'fs';
import path from 'path';

let redisClient: RedisClientType | null = null;
let isConnecting = false;

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  ACTIVITIES: 6 * 60 * 60,      // 6 hours (semi-static data)
  HOTELS: 3 * 60 * 60,           // 3 hours (prices change, but not too frequently)
  FLIGHTS: 1 * 60 * 60,          // 1 hour (prices more volatile)
  LOCATIONS: 24 * 60 * 60,       // 24 hours (coordinates are static)
} as const;

/**
 * Initialize Redis client connection
 */
export async function initRedis(): Promise<void> {
  if (redisClient || isConnecting) return;

  isConnecting = true;
  
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Max reconnection attempts reached');
            return new Error('Redis unavailable');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      // Redis connection error
    });

    redisClient.on('connect', () => {
      // Redis connected
    });

    redisClient.on('ready', () => {
      // Redis ready
    });

    await redisClient.connect();
  } catch (error: any) {
    // Failed to initialize Redis - cache disabled
    redisClient = null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Get Redis client (null if not connected)
 */
export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * Generate a cache key with namespace
 */
export function getCacheKey(namespace: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  return `amadeus:${namespace}:${sortedParams}`;
}

// Append cache metrics to local-reports/modified-api.log for offline parsing
function appendCacheMetric(line: string) {
  try {
    const outPath = path.resolve(process.cwd(), '../../local-reports/modified-api.log');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.appendFileSync(outPath, line + '\n');
  } catch {
    // ignore logging errors
  }
}

/**
 * Get cached data
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redisClient || !redisClient.isReady) {
    return null;
  }

  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;

  const data = JSON.parse(cached);
  const hitLine = `✓ Cache HIT: ${key}`;
  console.log(hitLine);
  appendCacheMetric(hitLine);
    return data as T;
  } catch (error: any) {
    return null;
  }
}

/**
 * Set cached data with TTL
 */
export async function setCached(key: string, data: any, ttlSeconds: number): Promise<void> {
  if (!redisClient || !redisClient.isReady) {
    return;
  }

  // Don't cache undefined or null values
  if (data === undefined || data === null) {
    return;
  }

  try {
  await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
  const setLine = `✓ Cache SET: ${key} (TTL: ${ttlSeconds}s)`;
  console.log(setLine);
  appendCacheMetric(setLine);
  } catch (error: any) {
    // Cache set error - silently ignore
  }
}

/**
 * Wrapper for caching Amadeus API calls
 */
export async function withCache<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCached<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch fresh data
  const missLine = `✗ Cache MISS: ${cacheKey}`;
  console.log(missLine);
  appendCacheMetric(missLine);
  const freshData = await fetchFn();

  // Store in cache for next time
  await setCached(cacheKey, freshData, ttlSeconds);

  return freshData;
}

/**
 * Clear cache by pattern (useful for debugging)
 */
export async function clearCachePattern(pattern: string): Promise<number> {
  if (!redisClient || !redisClient.isReady) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return 0;

    await redisClient.del(keys);
    return keys.length;
  } catch (error: any) {
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ connected: boolean; keys: number; memory: string }> {
  if (!redisClient || !redisClient.isReady) {
    return { connected: false, keys: 0, memory: '0B' };
  }

  try {
    const dbSize = await redisClient.dbSize();
    const info = await redisClient.info('memory');
    const memMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const memory = memMatch ? memMatch[1] : 'Unknown';

    return {
      connected: true,
      keys: dbSize,
      memory
    };
  } catch (error: any) {
    return { connected: false, keys: 0, memory: '0B' };
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
