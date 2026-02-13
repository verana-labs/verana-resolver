import Redis from 'ioredis';
import { getConfig } from '../config/index.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis === null) {
    const config = getConfig();
    _redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number): number | null {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
  }
  return _redis;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (_redis !== null) {
    await _redis.quit();
    _redis = null;
  }
}

export function isRedisReady(): boolean {
  return _redis !== null && _redis.status === 'ready';
}
