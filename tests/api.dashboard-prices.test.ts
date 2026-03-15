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

let pricesPayload = [
  {
    product_id: 101,
    name: "Brown Rice 2kg",
    category: "grains",
    cheapest_price: 620,
    cheapest_store: "MegaMart",
    unit_price: 310,
    unit_type: "kg",
    confidence_score: 9,
    date_recorded: "2026-03-15",
  },
  {
    product_id: 102,
    name: "Whole Milk 1L",
    category: "dairy",
    cheapest_price: 410,
    cheapest_store: "Hi-Lo",
    unit_price: 410,
    unit_type: "l",
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
      key: "dashboard-prices-test-cache-key",
      ttlSeconds,
    };
  },
  async cacheDelete() {},
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error(
        "Supabase should not be called in /api/dashboard/prices tests",
      );
    },
  },
  supabaseAdmin: null,
});

installModuleStub(dashboardServiceModulePath, {
  DashboardNotFoundError: class DashboardNotFoundError extends Error {},
  async getDashboard() {
    throw new Error("getDashboard should not be called in /api/dashboard/prices tests");
  },
  async getDashboardPrices() {
    return pricesPayload;
  },
  async getDashboardStores() {
    throw new Error("getDashboardStores should not be called in /api/dashboard/prices tests");
  },
  async getStorePrices() {
    throw new Error("getStorePrices should not be called in /api/dashboard/prices tests");
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add() {
      throw new Error(
        "Command queue should not be called in /api/dashboard/prices tests",
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
  pricesPayload = [
    {
      product_id: 102,
      name: "Whole Milk 1L",
      category: "dairy",
      cheapest_price: 410,
      cheapest_store: "Hi-Lo",
      unit_price: 410,
      unit_type: "l",
      confidence_score: 8,
      date_recorded: "2026-03-15",
    },
    {
      product_id: 101,
      name: "Brown Rice 2kg",
      category: "grains",
      cheapest_price: 620,
      cheapest_store: "MegaMart",
      unit_price: 310,
      unit_type: "kg",
      confidence_score: 9,
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

function assertPriceSummaryShape(item: any) {
  assert.equal(typeof item.product_id, "number");
  assert.equal(typeof item.name, "string");
  assert.ok(item.category === null || typeof item.category === "string");
  assert.equal(typeof item.cheapest_price, "number");
  assert.equal(typeof item.cheapest_store, "string");
  assert.ok(item.unit_price === null || typeof item.unit_price === "number");
  assert.ok(item.unit_type === null || typeof item.unit_type === "string");
  assert.ok(
    item.confidence_score === null || typeof item.confidence_score === "number",
  );
  assert.ok(item.date_recorded === null || typeof item.date_recorded === "string");
}

test("GET /api/dashboard/prices returns a prices array on the happy path", async () => {
  const response = await requestJson("/api/dashboard/prices");

  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(Array.isArray(response.body.prices));
  assert.equal(response.body.prices.length > 0, true);
  response.body.prices.forEach(assertPriceSummaryShape);
  assert.equal(typeof response.body.prices[0].cheapest_price, "number");
  assert.equal(response.body.prices[0].cheapest_price > 0, true);
});

test("GET /api/dashboard/prices returns the observable grouped or sorted price summary output", async () => {
  const response = await requestJson("/api/dashboard/prices");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.prices));
  response.body.prices.forEach(assertPriceSummaryShape);

  if (response.body.prices.length > 1) {
    const cheapestPrices = response.body.prices.map(
      (item: any) => item.cheapest_price,
    );
    assert.deepEqual(
      [...cheapestPrices].sort((left, right) => left - right),
      cheapestPrices,
    );
  }
});

test("GET /api/dashboard/prices handles an empty array response gracefully when no summary rows exist", async () => {
  pricesPayload = [];
  const response = await requestJson("/api/dashboard/prices?emptyState=true");

  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.ok(Array.isArray(response.body.prices));
});
