import { createHash } from "node:crypto";
import { deleteCached, getOrSetCachedJson } from "./redis.js";

const DEFAULT_CACHE_TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS || 300);

export function buildCacheKey(namespace: string, payload: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return `${namespace}:${hash}`;
}

export async function withCache<T>(
  namespace: string,
  payload: unknown,
  loader: () => Promise<T>,
  ttlSeconds = DEFAULT_CACHE_TTL_SECONDS,
): Promise<{ data: T; cacheHit: boolean; key: string; ttlSeconds: number }> {
  const key = buildCacheKey(namespace, payload);
  const result = await getOrSetCachedJson<T>(key, ttlSeconds, loader);

  return {
    ...result,
    key,
    ttlSeconds,
  };
}

export async function cacheDelete(key: string): Promise<void> {
  await deleteCached(key);
}
