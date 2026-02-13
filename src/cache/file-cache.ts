import { getRedis, isRedisReady } from './redis-client.js';
import { getConfig } from '../config/index.js';

const KEY_PREFIX = 'resolver:obj:';
const STATE_PREFIX = 'resolver:state:';

export function objectKey(urlOrDid: string): string {
  return `${KEY_PREFIX}${urlOrDid}`;
}

export function stateKey(name: string): string {
  return `${STATE_PREFIX}${name}`;
}

export async function getCachedFile(urlOrDid: string): Promise<string | null> {
  if (!isRedisReady()) return null;
  try {
    return await getRedis().get(objectKey(urlOrDid));
  } catch {
    return null;
  }
}

export async function setCachedFile(urlOrDid: string, content: string): Promise<void> {
  if (!isRedisReady()) return;
  const config = getConfig();
  try {
    await getRedis().set(objectKey(urlOrDid), content, 'EX', config.CACHE_TTL);
  } catch {
    // Redis is a performance optimization, not a correctness requirement
  }
}

export async function deleteCachedFile(urlOrDid: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await getRedis().del(objectKey(urlOrDid));
  } catch {
    // Best effort
  }
}

export async function deleteCachedFiles(urlsOrDids: string[]): Promise<void> {
  if (!isRedisReady() || urlsOrDids.length === 0) return;
  try {
    const keys = urlsOrDids.map(objectKey);
    await getRedis().del(...keys);
  } catch {
    // Best effort
  }
}

export async function setCachedFilesBatch(
  entries: Array<{ urlOrDid: string; content: string }>,
  batchSize = 100,
): Promise<void> {
  if (!isRedisReady() || entries.length === 0) return;
  const config = getConfig();
  const redis = getRedis();

  try {
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const pipeline = redis.pipeline();
      for (const entry of batch) {
        pipeline.set(objectKey(entry.urlOrDid), entry.content, 'EX', config.CACHE_TTL);
      }
      await pipeline.exec();
    }
  } catch {
    // Best effort
  }
}

export async function getState(name: string): Promise<string | null> {
  if (!isRedisReady()) return null;
  try {
    return await getRedis().get(stateKey(name));
  } catch {
    return null;
  }
}

export async function setState(name: string, value: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await getRedis().set(stateKey(name), value);
  } catch {
    // Best effort
  }
}
