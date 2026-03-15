import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));

const cacheModulePath = requireFromRoot.resolve("./src/lib/cache.ts");
const envModulePath = requireFromRoot.resolve("./src/config/env.ts");
const loggerModulePath = requireFromRoot.resolve("./src/utils/logger.ts");
const upstashModulePath = requireFromRoot.resolve("@upstash/redis");

let fakeStore = new Map<string, string>();
let shouldThrowOnGet = false;
let shouldThrowOnSet = false;
let shouldThrowOnDel = false;
let shouldThrowOnScan = false;

function installModuleStub(modulePath: string, exports: unknown) {
  requireFromRoot.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    path: path.dirname(modulePath),
    paths: [],
    isPreloading: false,
    parent: undefined,
    require: requireFromRoot,
  } as NodeJS.Module;
}

installModuleStub(envModulePath, {
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  },
});

installModuleStub(loggerModulePath, {
  logError() {},
  logInfo() {},
  logWarn() {},
});

installModuleStub(upstashModulePath, {
  Redis: class MockRedis {
    async get(key: string) {
      if (shouldThrowOnGet) {
        throw new Error("mock get failure");
      }

      return fakeStore.get(key) ?? null;
    }

    async set(key: string, value: string) {
      if (shouldThrowOnSet) {
        throw new Error("mock set failure");
      }

      fakeStore.set(key, value);
      return "OK";
    }

    async del(...keys: string[]) {
      if (shouldThrowOnDel) {
        throw new Error("mock del failure");
      }

      for (const key of keys) {
        fakeStore.delete(key);
      }

      return keys.length;
    }

    async scan(cursor: number, options: { match?: string }) {
      if (shouldThrowOnScan) {
        throw new Error("mock scan failure");
      }

      const prefix = (options.match ?? "").replace(/\*$/, "");
      const keys = [...fakeStore.keys()].filter((key) => key.startsWith(prefix));
      return [cursor === 0 ? 0 : 0, keys] as const;
    }
  },
});

function loadCacheModule() {
  delete requireFromRoot.cache[cacheModulePath];
  return requireFromRoot(cacheModulePath) as typeof import("../src/lib/cache.js");
}

beforeEach(() => {
  fakeStore = new Map<string, string>();
  shouldThrowOnGet = false;
  shouldThrowOnSet = false;
  shouldThrowOnDel = false;
  shouldThrowOnScan = false;
});

afterEach(() => {
  delete requireFromRoot.cache[cacheModulePath];
});

test("cache.ts serializes objects and reads them back", async () => {
  const cache = loadCacheModule();
  const payload = { id: "123", name: "Scout", items: ["milk", "bread"] };

  await cache.cacheSet("dashboard:user:123", payload, 300);
  const value = await cache.cacheGet<typeof payload>("dashboard:user:123");

  assert.deepEqual(value, payload);
});

test("cache.ts swallows Upstash get failures", async () => {
  const cache = loadCacheModule();
  shouldThrowOnGet = true;

  const value = await cache.cacheGet("search:rice:2:null:null");

  assert.equal(value, null);
});

test("cache.ts swallows Upstash write and invalidation failures", async () => {
  const cache = loadCacheModule();
  shouldThrowOnSet = true;
  shouldThrowOnDel = true;
  shouldThrowOnScan = true;

  await assert.doesNotReject(async () => {
    await cache.cacheSet("dashboard:prices", [{ product_id: 1 }], 300);
    await cache.cacheDelete("dashboard:prices");
    await cache.cacheInvalidatePrefix("store:prices:");
  });
});
