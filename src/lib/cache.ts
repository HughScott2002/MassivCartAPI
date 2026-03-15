import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";
import { logError } from "../utils/logger.js";

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize<T>(value: unknown): T | null {
  if (typeof value !== "string") {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get<string>(key);

    if (value == null) {
      return null;
    }

    return deserialize<T>(value);
  } catch (error) {
    logError("Cache GET failed", error, { key });
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttl?: number,
): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const serialized = serialize(value);

    if (ttl == null) {
      await redis.set(key, serialized);
      return;
    }

    await redis.set(key, serialized, { ex: ttl });
  } catch (error) {
    logError("Cache SET failed", error, { key, ttl: ttl ?? null });
  }
}

export async function cacheDelete(key: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    logError("Cache DELETE failed", error, { key });
  }
}

export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    let cursor = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${prefix}*`,
        count: 100,
      });

      cursor = Number(nextCursor);

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== 0);
  } catch (error) {
    logError("Cache prefix invalidation failed", error, { prefix });
  }
}

export async function invalidateDashboardPriceCaches(): Promise<void> {
  await Promise.all([
    cacheDelete("dashboard:prices"),
    cacheDelete("dashboard:stores"),
    cacheInvalidatePrefix("store:prices:"),
  ]);
}
