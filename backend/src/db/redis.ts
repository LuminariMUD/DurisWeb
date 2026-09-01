import Redis from 'ioredis';
import logger from '../utils/logger.js';

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

/**
 * Close Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
}

export default redis;

// Cache helper functions
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (err) {
    logger.error('Redis get error:', err);
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.error('Redis set error:', err);
  }
}

export async function deleteCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.error('Redis delete error:', err);
  }
}

// Map serialization helpers for Redis storage
// JavaScript Maps don't serialize to JSON natively, so we convert to/from objects

/**
 * Convert a Map to a plain object for Redis storage
 */
export function mapToObject<V>(map: Map<string | number, V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of map) {
    obj[String(key)] = value;
  }
  return obj;
}

/**
 * Convert a plain object back to a Map after Redis retrieval
 */
export function objectToMap<V>(obj: Record<string, V>): Map<string, V> {
  return new Map(Object.entries(obj));
}

/**
 * Convert a plain object back to a Map with numeric keys
 */
export function objectToMapNumeric<V>(obj: Record<string, V>): Map<number, V> {
  const map = new Map<number, V>();
  for (const [key, value] of Object.entries(obj)) {
    map.set(Number(key), value);
  }
  return map;
}

/**
 * Generic cached data fetcher - checks Redis first, falls back to fetch function
 * Reduces boilerplate in services
 */
export async function getCachedOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetchFn();
  await setCache(key, data, ttlSeconds);
  return data;
}
