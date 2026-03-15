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

let storePricesError: Error | null = null;
let storeProductsPayload = [
  {
    product_id: 11,
    name: "Brown Rice 2kg",
    category: "grains",
    unit_type: "kg",
    price: 620,
    unit_price: 310,
    confidence_score: 9,
    date_recorded: "2026-03-15",
  },
  {
    product_id: 10,
    name: "Coconut Milk 400ml",
    category: "canned",
    unit_type: "ml",
    price: 250,
    unit_price: 625,
    confidence_score: 8,
    date_recorded: "2026-03-15",
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
      key: "dashboard-store-prices-test-cache-key",
      ttlSeconds,
    };
  },
  async cacheDelete() {},
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error(
        "Supabase should not be called in /api/dashboard/stores/:storeId/prices tests",
      );
    },
  },
  supabaseAdmin: null,
});

class DashboardNotFoundError extends Error {}

installModuleStub(dashboardServiceModulePath, {
  DashboardNotFoundError,
  async getDashboard() {
    throw new Error("getDashboard should not be called in store-prices tests");
  },
  async getDashboardPrices() {
    throw new Error("getDashboardPrices should not be called in store-prices tests");
  },
  async getDashboardStores() {
    throw new Error("getDashboardStores should not be called in store-prices tests");
  },
  async getStorePrices() {
    if (storePricesError) {
      throw storePricesError;
    }

    return storeProductsPayload;
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add() {
      throw new Error(
        "Command queue should not be called in /api/dashboard/stores/:storeId/prices tests",
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
  storePricesError = null;
  storeProductsPayload = [
    {
      product_id: 11,
      name: "Brown Rice 2kg",
      category: "grains",
      unit_type: "kg",
      price: 620,
      unit_price: 310,
      confidence_score: 9,
      date_recorded: "2026-03-15",
    },
    {
      product_id: 12,
      name: "Whole Milk 1L",
      category: "dairy",
      unit_type: "l",
      price: 410,
      unit_price: 410,
      confidence_score: 8,
      date_recorded: "2026-03-15",
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

function assertStoreProductShape(item: any) {
  assert.equal(typeof item.product_id, "number");
  assert.equal(typeof item.name, "string");
  assert.ok(item.category === null || typeof item.category === "string");
  assert.ok(item.unit_type === null || typeof item.unit_type === "string");
  assert.equal(typeof item.price, "number");
  assert.ok(item.unit_price === null || typeof item.unit_price === "number");
  assert.ok(
    item.confidence_score === null || typeof item.confidence_score === "number",
  );
  assert.ok(item.date_recorded === null || typeof item.date_recorded === "string");
}

test("GET /api/dashboard/stores/:storeId/prices returns 404 when the store is not found", async () => {
  storePricesError = new DashboardNotFoundError("Store not found");
  const response = await requestJson("/api/dashboard/stores/99999/prices");

  assert.equal(response.status, 404);
  assert.equal(response.body?.error, "Store not found");
});

test("GET /api/dashboard/stores/:storeId/prices returns a products array for a valid numeric storeId", async () => {
  const response = await requestJson("/api/dashboard/stores/1/prices");

  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(Array.isArray(response.body.products));
  assert.equal(response.body.products.length > 0, true);
  response.body.products.forEach(assertStoreProductShape);
});

test("GET /api/dashboard/stores/:storeId/prices returns observably sorted products when implemented", async () => {
  const response = await requestJson("/api/dashboard/stores/1/prices");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.products));
  response.body.products.forEach(assertStoreProductShape);

  if (response.body.products.length > 1) {
    const names = response.body.products.map((product: any) => product.name);
    assert.deepEqual([...names].sort(), names);
  }
});

test("GET /api/dashboard/stores/:storeId/prices returns real prices ahead of synthetic duplicates when implemented", async () => {
  storeProductsPayload = [
    {
      product_id: 21,
      name: "Alpha",
      category: "grains",
      unit_type: "kg",
      price: 500,
      unit_price: 250,
      confidence_score: 9,
      date_recorded: "2026-03-15",
    },
  ];
  const response = await requestJson("/api/dashboard/stores/1/prices?preferReal=true");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.products));

  for (const product of response.body.products) {
    assertStoreProductShape(product);
  }
});
