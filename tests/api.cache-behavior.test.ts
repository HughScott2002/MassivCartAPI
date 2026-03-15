import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));

const searchRouterModulePath = requireFromRoot.resolve("./src/api/search.ts");
const dashboardRouterModulePath = requireFromRoot.resolve("./src/api/dashboard.ts");
const cacheModulePath = requireFromRoot.resolve("./src/lib/cache.ts");
const searchServiceModulePath = requireFromRoot.resolve("./src/services/search-service.ts");
const dashboardServiceModulePath = requireFromRoot.resolve(
  "./src/services/dashboard-service.ts",
);
const supabaseModulePath = requireFromRoot.resolve("./src/db/supabase-client.ts");
const loggerModulePath = requireFromRoot.resolve("./src/utils/logger.ts");

let searchCallCount = 0;
let dashboardCallCount = 0;
let cacheFailureMode = false;
let cacheStore = new Map<string, unknown>();

const searchResults = [
  {
    product_id: 101,
    canonical_name: "Brown Rice 2kg",
    category: "grains",
    unit_type: "kg",
    cheapest_price: 620,
    cheapest_store: "MegaMart",
    prices: [
      {
        store_id: 2,
        store_name: "MegaMart",
        branch: "Waterloo",
        parish: "St. Andrew",
        price: 620,
        confidence_score: 9,
        date_recorded: "2026-03-15",
        distance_km: null,
      },
    ],
  },
];

const dashboardPayload = {
  id: "00000000-0000-0000-0000-000000000001",
  display_name: "Test User",
  points: 1500,
  tier: "smart_shopper",
  next_tier: "price_scout",
  tier_progress: 25,
  streak_days: 3,
  receipts_uploaded: 8,
  weekly_uploads: 2,
  weekly_upload_goal: 5,
  last_upload_at: "2026-03-15T00:00:00.000Z",
  weekly_budget: 5000,
  parish: "Kingston",
};

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

installModuleStub(cacheModulePath, {
  async cacheGet<T>(key: string): Promise<T | null> {
    if (cacheFailureMode) {
      return null;
    }

    return (cacheStore.get(key) as T | undefined) ?? null;
  },
  async cacheSet(key: string, value: unknown): Promise<void> {
    if (cacheFailureMode) {
      return;
    }

    cacheStore.set(key, value);
  },
  async cacheDelete(key: string): Promise<void> {
    cacheStore.delete(key);
  },
  async cacheInvalidatePrefix(prefix: string): Promise<void> {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) {
        cacheStore.delete(key);
      }
    }
  },
  async invalidateDashboardPriceCaches(): Promise<void> {
    cacheStore.delete("dashboard:prices");
    cacheStore.delete("dashboard:stores");
    for (const key of cacheStore.keys()) {
      if (key.startsWith("store:prices:")) {
        cacheStore.delete(key);
      }
    }
  },
});

installModuleStub(searchServiceModulePath, {
  async performSearch() {
    searchCallCount += 1;
    return searchResults;
  },
});

class DashboardNotFoundError extends Error {}

installModuleStub(dashboardServiceModulePath, {
  DashboardNotFoundError,
  async getDashboard(userId: string) {
    dashboardCallCount += 1;
    return {
      ...dashboardPayload,
      id: userId,
    };
  },
  async getDashboardPrices() {
    return [];
  },
  async getDashboardStores() {
    return [];
  },
  async getStorePrices() {
    return [];
  },
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error("Supabase should not be called in cache behavior tests");
    },
  },
  supabaseAdmin: null,
});

installModuleStub(loggerModulePath, {
  logError() {},
  logInfo() {},
  logWarn() {},
});

const searchApp = express();
searchApp.use(express.json());
searchApp.use(requireFromRoot(searchRouterModulePath).default);

const dashboardApp = express();
dashboardApp.use(express.json());
dashboardApp.use(requireFromRoot(dashboardRouterModulePath).default);

class MockSocket extends Writable {
  chunks: Buffer[] = [];
  remoteAddress = "127.0.0.1";

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  cork() {}

  uncork() {}

  destroy() {
    return this;
  }
}

async function requestJson(
  app: Express,
  method: "GET" | "POST",
  pathName: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const payload = body ? JSON.stringify(body) : "";
  const req = Readable.from(body ? [payload] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
    connection: { remoteAddress: string };
  };
  req.method = method;
  req.url = pathName;
  req.headers = body
    ? {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
      }
    : {};
  req.socket = { remoteAddress: "127.0.0.1" };
  req.connection = req.socket;

  const socket = new MockSocket();
  const res = new ServerResponse(req);
  res.assignSocket(socket as any);

  await new Promise<void>((resolve, reject) => {
    res.on("finish", () => resolve());
    res.on("error", reject);
    app.handle(req as any, res);
  });

  const rawResponse = Buffer.concat(socket.chunks).toString("utf8");
  const [, rawBody = ""] = rawResponse.split("\r\n\r\n");

  return {
    status: res.statusCode,
    body: rawBody ? JSON.parse(rawBody) : null,
  };
}

beforeEach(() => {
  searchCallCount = 0;
  dashboardCallCount = 0;
  cacheFailureMode = false;
  cacheStore = new Map<string, unknown>();
});

after(() => {
  delete requireFromRoot.cache[searchRouterModulePath];
  delete requireFromRoot.cache[dashboardRouterModulePath];
  delete requireFromRoot.cache[cacheModulePath];
  delete requireFromRoot.cache[searchServiceModulePath];
  delete requireFromRoot.cache[dashboardServiceModulePath];
  delete requireFromRoot.cache[supabaseModulePath];
  delete requireFromRoot.cache[loggerModulePath];
});

test("search endpoint caches results after the first request", async () => {
  const first = await requestJson(searchApp, "POST", "/api/search", {
    terms: ["rice"],
  });
  const second = await requestJson(searchApp, "POST", "/api/search", {
    terms: ["rice"],
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(searchCallCount, 1);
});

test("dashboard endpoint caches results after the first request", async () => {
  const userId = "00000000-0000-0000-0000-000000000001";
  const first = await requestJson(
    dashboardApp,
    "GET",
    `/api/dashboard?userId=${userId}`,
  );
  const second = await requestJson(
    dashboardApp,
    "GET",
    `/api/dashboard?userId=${userId}`,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(dashboardCallCount, 1);
});

test("endpoints still return responses when cache is unavailable", async () => {
  cacheFailureMode = true;

  const searchResponse = await requestJson(searchApp, "POST", "/api/search", {
    terms: ["rice"],
  });
  const dashboardResponse = await requestJson(
    dashboardApp,
    "GET",
    "/api/dashboard?userId=00000000-0000-0000-0000-000000000001",
  );

  assert.equal(searchResponse.status, 200);
  assert.deepEqual(searchResponse.body, searchResults);
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardResponse.body.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(searchCallCount, 1);
  assert.equal(dashboardCallCount, 1);
});
