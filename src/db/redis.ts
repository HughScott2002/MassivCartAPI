import { createClient, type RedisClientType } from "redis";
import { logError, logInfo, logWarn } from "../utils/logger.js";

let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<void> | null = null;

function getRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT || 6379);

  return `redis://${host}:${port}`;
}

function getClient(): RedisClientType {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    url: getRedisUrl(),
  });

  redisClient.on("error", (error) => {
    logError("Redis client error", error, { url: getRedisUrl() });
  });

  redisClient.on("reconnecting", () => {
    logWarn("Redis reconnecting", { url: getRedisUrl() });
  });

  redisClient.on("ready", () => {
    logInfo("Redis ready", { url: getRedisUrl() });
  });

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getClient();

  if (client.isOpen) {
    return;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = client
      .connect()
      .then(() => undefined)
      .finally(() => {
        redisConnectPromise = null;
      });
  }

  await redisConnectPromise;
}

export function isRedisReady(): boolean {
  return Boolean(redisClient?.isReady);
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient?.isOpen) {
    return;
  }

  await redisClient.quit();
  logInfo("Redis disconnected");
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) {
    return null;
  }

  const client = getClient();
  const rawValue = await client.get(key);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as T;
}

export async function setCachedJson<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!isRedisReady()) {
    return;
  }

  const client = getClient();

  await client.set(key, JSON.stringify(value), {
    EX: ttlSeconds,
  });
}

export async function getOrSetCachedJson<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<{ data: T; cacheHit: boolean }> {
  const cachedValue = await getCachedJson<T>(key);

  if (cachedValue !== null) {
    return {
      data: cachedValue,
      cacheHit: true,
    };
  }

  const freshValue = await loader();
  await setCachedJson(key, freshValue, ttlSeconds);

  return {
    data: freshValue,
    cacheHit: false,
  };
}
