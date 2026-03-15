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

let dashboardError: Error | null = null;
let dashboardPayload = {
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
  async withCache<T>(
    _namespace: string,
    _payload: unknown,
    loader: () => Promise<T>,
    ttlSeconds = 300,
  ) {
    return {
      data: await loader(),
      cacheHit: false,
      key: "dashboard-test-cache-key",
      ttlSeconds,
    };
  },
  async cacheDelete() {},
});

installModuleStub(supabaseModulePath, {
  supabase: {
    from() {
      throw new Error("Supabase should not be called in /api/dashboard tests");
    },
  },
  supabaseAdmin: null,
});

class DashboardNotFoundError extends Error {}

installModuleStub(dashboardServiceModulePath, {
  DashboardNotFoundError,
  async getDashboard(userId: string) {
    if (dashboardError) {
      throw dashboardError;
    }

    return {
      ...dashboardPayload,
      id: userId,
    };
  },
  async getDashboardPrices() {
    throw new Error("getDashboardPrices should not be called in /api/dashboard tests");
  },
  async getDashboardStores() {
    throw new Error("getDashboardStores should not be called in /api/dashboard tests");
  },
  async getStorePrices() {
    throw new Error("getStorePrices should not be called in /api/dashboard tests");
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add() {
      throw new Error("Command queue should not be called in /api/dashboard tests");
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
  dashboardError = null;
  dashboardPayload = {
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
): Promise<{ status: number; body: any }> {
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

function assertDashboardShape(body: any) {
  assert.equal(typeof body, "object");
  assert.ok(body);
  assert.equal(typeof body.id, "string");
  assert.equal(typeof body.display_name, "string");
  assert.equal(typeof body.points, "number");
  assert.equal(typeof body.tier, "string");
  assert.ok(body.next_tier === null || typeof body.next_tier === "string");
  assert.equal(typeof body.tier_progress, "number");
  assert.equal(typeof body.streak_days, "number");
  assert.equal(typeof body.receipts_uploaded, "number");
  assert.equal(typeof body.weekly_uploads, "number");
  assert.equal(typeof body.weekly_upload_goal, "number");
}

test("GET /api/dashboard returns 400 when userId is missing", async () => {
  const response = await requestJson("/api/dashboard");

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "userId required");
});

test("GET /api/dashboard returns 404 when userId does not exist", async () => {
  dashboardError = new DashboardNotFoundError("User not found");

  const response = await requestJson(
    "/api/dashboard?userId=00000000-0000-0000-0000-000000000999",
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "User not found");
});

test("GET /api/dashboard returns the expected dashboard shape for a valid user", async () => {
  const response = await requestJson(
    "/api/dashboard?userId=00000000-0000-0000-0000-000000000001",
  );

  assert.equal(response.status, 200);
  assertDashboardShape(response.body);
  assert.equal(response.body.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(response.body.display_name.length > 0, true);
  assert.equal(Number.isFinite(response.body.points), true);
  assert.equal(Number.isFinite(response.body.tier_progress), true);
  assert.equal(Number.isInteger(response.body.streak_days), true);
  assert.equal(Number.isInteger(response.body.receipts_uploaded), true);
  assert.equal(Number.isInteger(response.body.weekly_uploads), true);
  assert.equal(response.body.weekly_upload_goal, 5);
});
