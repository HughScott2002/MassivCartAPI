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
const cacheModulePath = requireFromRoot.resolve("./src/db/cache.ts");
const supabaseModulePath = requireFromRoot.resolve("./src/db/supabase-client.ts");
const dataAccessModulePath = requireFromRoot.resolve("./src/db/data-access.ts");
const queueModulePath = requireFromRoot.resolve("./src/queue/claude-queue.ts");
const redisModulePath = requireFromRoot.resolve("./src/db/redis.ts");
const loggerModulePath = requireFromRoot.resolve("./src/utils/logger.ts");

type Store = {
  id: number;
  name: string;
  branch: string | null;
  parish: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Product = {
  id: number;
  canonical_name: string;
  category: string | null;
  unit_type: string | null;
  aliases: string[] | null;
};

type Price = {
  id: number;
  product_id: number | null;
  store_id: number | null;
  price: number;
  confidence_score: number | null;
  date_recorded: string | null;
  currency?: string | null;
  is_synthetic?: boolean | null;
};

let stores: Store[] = [];
let products: Product[] = [];
let prices: Price[] = [];
let dataAccessCalls = {
  getStores: 0,
  getProducts: 0,
  getPrices: 0,
};
let cacheCalls: Array<{ namespace: string; payload: unknown }> = [];

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
    namespace: string,
    payload: unknown,
    loader: () => Promise<T>,
    ttlSeconds = 300,
  ) {
    cacheCalls.push({ namespace, payload });
    return {
      data: await loader(),
      cacheHit: false,
      key: `${namespace}:test`,
      ttlSeconds,
    };
  },
  async cacheDelete() {},
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error("Supabase should not be called in /api/search tests");
    },
  },
  supabaseAdmin: null,
});

installModuleStub(dataAccessModulePath, {
  async getStores() {
    dataAccessCalls.getStores += 1;
    return stores;
  },
  async getProducts() {
    dataAccessCalls.getProducts += 1;
    return products;
  },
  async getPrices() {
    dataAccessCalls.getPrices += 1;
    return prices;
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add() {
      throw new Error("Command queue should not be called in /api/search tests");
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

beforeEach(() => {
  stores = [
    {
      id: 1,
      name: "Hi-Lo",
      branch: "Cross Roads",
      parish: "Kingston",
      latitude: 18.005,
      longitude: -76.749,
    },
    {
      id: 2,
      name: "MegaMart",
      branch: "Waterloo",
      parish: "St. Andrew",
      latitude: 18.043,
      longitude: -76.793,
    },
    {
      id: 3,
      name: "Fontana",
      branch: "Half-Way-Tree",
      parish: "St. Andrew",
      latitude: 18.012,
      longitude: -76.797,
    },
  ];
  products = [
    {
      id: 101,
      canonical_name: "Brown Rice 2kg",
      category: "grains",
      unit_type: "kg",
      aliases: ["rice"],
    },
    {
      id: 102,
      canonical_name: "Whole Milk 1L",
      category: "dairy",
      unit_type: "l",
      aliases: ["milk"],
    },
    {
      id: 103,
      canonical_name: "Panadol 500mg 10s",
      category: "pharmacy",
      unit_type: "tabs",
      aliases: ["panadol"],
    },
  ];
  prices = [
    {
      id: 1001,
      product_id: 101,
      store_id: 1,
      price: 650,
      confidence_score: 8,
      date_recorded: "2026-03-15",
    },
    {
      id: 1002,
      product_id: 101,
      store_id: 2,
      price: 620,
      confidence_score: 9,
      date_recorded: "2026-03-15",
    },
    {
      id: 1003,
      product_id: 102,
      store_id: 1,
      price: 410,
      confidence_score: 7,
      date_recorded: "2026-03-15",
    },
  ];
  dataAccessCalls = {
    getStores: 0,
    getProducts: 0,
    getPrices: 0,
  };
  cacheCalls = [];
});

after(() => {
  delete requireFromRoot.cache[appModulePath];
  delete requireFromRoot.cache[cacheModulePath];
  delete requireFromRoot.cache[supabaseModulePath];
  delete requireFromRoot.cache[dataAccessModulePath];
  delete requireFromRoot.cache[queueModulePath];
  delete requireFromRoot.cache[redisModulePath];
  delete requireFromRoot.cache[loggerModulePath];
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

async function requestJson(
  pathName: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify(body);
  const req = Readable.from([payload]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
    connection: { remoteAddress: string };
  };
  req.method = "POST";
  req.url = pathName;
  req.headers = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
  };
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

function assertSearchItemShape(item: any) {
  assert.equal(typeof item.product_id, "number");
  assert.equal(typeof item.canonical_name, "string");
  assert.ok("category" in item);
  assert.ok("unit_type" in item);
  assert.equal(typeof item.cheapest_price, "number");
  assert.equal(typeof item.cheapest_store, "string");
  assert.ok(Array.isArray(item.prices));
}

test("POST /api/search returns 400 when terms is missing", async () => {
  const response = await requestJson("/api/search", {});

  assert.equal(response.status, 400);
  assert.deepEqual(
    Object.keys(response.body).sort(),
    ["details", "error", "ok"],
  );
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "Invalid query parameters");
  assert.ok(response.body.details?.fieldErrors?.terms);
});

test("POST /api/search returns 400 when terms is an empty array", async () => {
  const response = await requestJson("/api/search", { terms: [] });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "Invalid query parameters");
  assert.ok(response.body.details?.fieldErrors?.terms);
});

test("POST /api/search returns a single-term match with the current route shape", async () => {
  const response = await requestJson("/api/search", { terms: ["rice"] });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.equal(response.body.length, 1);
  assertSearchItemShape(response.body[0]);
  assert.equal(response.body[0].product_id, 101);
  assert.equal(response.body[0].canonical_name, "Brown Rice 2kg");
  assert.equal(response.body[0].cheapest_price, 620);
  assert.equal(response.body[0].cheapest_store, "MegaMart");
  assert.equal(response.body[0].prices.length, 2);
  assert.deepEqual(dataAccessCalls, {
    getStores: 1,
    getProducts: 1,
    getPrices: 1,
  });
});

test("POST /api/search returns matches for multiple terms", async () => {
  const response = await requestJson("/api/search", {
    terms: ["rice", "milk"],
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.equal(response.body.length, 2);
  assert.deepEqual(
    response.body.map((item: any) => item.canonical_name).sort(),
    ["Brown Rice 2kg", "Whole Milk 1L"],
  );
  response.body.forEach(assertSearchItemShape);
});

test("POST /api/search filters out matched products that have zero price rows", async () => {
  const response = await requestJson("/api/search", { terms: ["panadol"] });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("POST /api/search returns empty results when nothing matches", async () => {
  const response = await requestJson("/api/search", {
    terms: ["xyznonexistent"],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("POST /api/search passes savingsMode and user coordinates through to the search logic", async () => {
  const response = await requestJson("/api/search", {
    terms: ["rice"],
    savingsMode: 0,
    userLat: 18.0061,
    userLng: -76.7466,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].prices.length, 1);
  assert.equal(response.body[0].prices[0].store_name, "Hi-Lo");
  assert.equal(typeof response.body[0].prices[0].distance_km, "number");
  assert.equal(cacheCalls.length, 1);
  assert.deepEqual(cacheCalls[0], {
    namespace: "search",
    payload: {
      terms: ["rice"],
      savingsMode: 0,
      userLat: 18.0061,
      userLng: -76.7466,
    },
  });
});
