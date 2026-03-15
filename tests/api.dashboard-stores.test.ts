import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));

const appModulePath = requireFromRoot.resolve("./src/app.ts");
const dashboardServiceModulePath = requireFromRoot.resolve("./src/services/dashboard-service.ts");
const cacheModulePath = requireFromRoot.resolve("./src/db/cache.ts");
const supabaseModulePath = requireFromRoot.resolve("./src/db/supabase-client.ts");
const queueModulePath = requireFromRoot.resolve("./src/queue/claude-queue.ts");
const redisModulePath = requireFromRoot.resolve("./src/db/redis.ts");
const loggerModulePath = requireFromRoot.resolve("./src/utils/logger.ts");

let storesPayload = [
  {
    id: 1,
    name: "Hi-Lo",
    store_type: "grocery",
    branch: "Cross Roads",
    latitude: 18.005,
    longitude: -76.749,
    parish: "Kingston",
  },
  {
    id: 2,
    name: "MegaMart",
    store_type: "grocery",
    branch: "Waterloo",
    latitude: 18.043,
    longitude: -76.793,
    parish: "St. Andrew",
  },
];

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
  async withCache<T>(
    _namespace: string,
    _payload: unknown,
    loader: () => Promise<T>,
    ttlSeconds = 300,
  ) {
    return {
      data: await loader(),
      cacheHit: false,
      key: "dashboard-stores-test-cache-key",
      ttlSeconds,
    };
  },
  async cacheDelete() {},
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error(
        "Supabase should not be called in /api/dashboard/stores tests",
      );
    },
  },
  supabaseAdmin: null,
});

installModuleStub(dashboardServiceModulePath, {
  DashboardNotFoundError: class DashboardNotFoundError extends Error {},
  async getDashboard() {
    throw new Error("getDashboard should not be called in /api/dashboard/stores tests");
  },
  async getDashboardPrices() {
    throw new Error("getDashboardPrices should not be called in /api/dashboard/stores tests");
  },
  async getDashboardStores() {
    return storesPayload;
  },
  async getStorePrices() {
    throw new Error("getStorePrices should not be called in /api/dashboard/stores tests");
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add() {
      throw new Error(
        "Command queue should not be called in /api/dashboard/stores tests",
      );
    },
  },
  commandQueueEvents: {},
});

installModuleStub(redisModulePath, {
  isRedisReady() {
    return false;
  },
});

installModuleStub(loggerModulePath, {
  logError() {},
  logInfo() {},
  logWarn() {},
});

const app = requireFromRoot(appModulePath).default;

after(() => {
  delete requireFromRoot.cache[appModulePath];
  delete requireFromRoot.cache[dashboardServiceModulePath];
  delete requireFromRoot.cache[cacheModulePath];
  delete requireFromRoot.cache[supabaseModulePath];
  delete requireFromRoot.cache[queueModulePath];
  delete requireFromRoot.cache[redisModulePath];
  delete requireFromRoot.cache[loggerModulePath];
});

beforeEach(() => {
  storesPayload = [
    {
      id: 1,
      name: "Hi-Lo",
      store_type: "grocery",
      branch: "Cross Roads",
      latitude: 18.005,
      longitude: -76.749,
      parish: "Kingston",
    },
    {
      id: 2,
      name: "MegaMart",
      store_type: "grocery",
      branch: "Waterloo",
      latitude: 18.043,
      longitude: -76.793,
      parish: "St. Andrew",
    },
  ];
});

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

async function requestJson(pathName: string): Promise<{ status: number; body: any }> {
  const req = Readable.from([]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
    connection: { remoteAddress: string };
  };
  req.method = "GET";
  req.url = pathName;
  req.headers = {};
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
  let parsedBody: unknown = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  return {
    status: res.statusCode,
    body: parsedBody,
  };
}

function assertStoreShape(item: any) {
  assert.equal(typeof item.id, "number");
  assert.equal(typeof item.name, "string");
  assert.equal(typeof item.store_type, "string");
  assert.ok(item.branch === null || typeof item.branch === "string");
  assert.equal(typeof item.latitude, "number");
  assert.equal(typeof item.longitude, "number");
  assert.equal(typeof item.parish, "string");
}

test("GET /api/dashboard/stores returns a stores array on the happy path", async () => {
  const response = await requestJson("/api/dashboard/stores");

  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(Array.isArray(response.body.stores));
  assert.equal(response.body.stores.length > 0, true);
  response.body.stores.forEach(assertStoreShape);
});

test("GET /api/dashboard/stores returns numeric coordinates for each store", async () => {
  const response = await requestJson("/api/dashboard/stores");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.stores));
  response.body.stores.forEach((store: any) => {
    assertStoreShape(store);
    assert.equal(Number.isFinite(store.latitude), true);
    assert.equal(Number.isFinite(store.longitude), true);
  });
});

test("GET /api/dashboard/stores handles an empty array response gracefully when supported", async () => {
  storesPayload = [];
  const response = await requestJson("/api/dashboard/stores?emptyState=true");

  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(Array.isArray(response.body.stores));
});
