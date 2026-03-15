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
const searchServiceModulePath = requireFromRoot.resolve("./src/services/search-service.ts");
const queueModulePath = requireFromRoot.resolve("./src/queue/claude-queue.ts");
const loggerModulePath = requireFromRoot.resolve("./src/utils/logger.ts");

type CommandAction = {
  budget: number | null;
  savings_mode: number | null;
  search_terms: string[] | null;
  text: string;
};

type SearchResult = {
  product_id: number;
  canonical_name: string;
  category: string | null;
  unit_type: string | null;
  cheapest_price: number;
  cheapest_store: string;
  prices: Array<{
    store_id: number;
    store_name: string;
    branch: string | null;
    parish: string | null;
    price: number;
    confidence_score: number | null;
    date_recorded: string | null;
    distance_km: number | null;
  }>;
};

type UpdateCall = {
  client: "admin" | "anon";
  table: string;
  payload: Record<string, unknown>;
  column: string;
  value: string;
};

let nextAction: CommandAction = {
  budget: null,
  savings_mode: null,
  search_terms: null,
  text: "No action",
};
let queueError: Error | null = null;
let searchResults: SearchResult[] = [];
let queueAddCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];
let searchCalls: Array<Record<string, unknown>> = [];
let updateCalls: UpdateCall[] = [];
let cacheDeleteCalls: string[] = [];
let supabaseUpdateError: Error | null = null;

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

function makeSupabaseClient(client: "admin" | "anon") {
  return {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              updateCalls.push({ client, table, payload, column, value });
              return { error: supabaseUpdateError };
            },
          };
        },
      };
    },
  };
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
      key: "test-cache-key",
      ttlSeconds,
    };
  },
  async cacheDelete(key: string) {
    cacheDeleteCalls.push(key);
  },
});

installModuleStub(supabaseModulePath, {
  supabase: makeSupabaseClient("anon"),
  supabaseAdmin: makeSupabaseClient("admin"),
});

installModuleStub(searchServiceModulePath, {
  async performSearch(request: Record<string, unknown>) {
    searchCalls.push(request);
    return searchResults;
  },
});

installModuleStub(queueModulePath, {
  commandQueue: {
    async add(name: string, payload: Record<string, unknown>) {
      queueAddCalls.push({ name, payload });

      if (queueError) {
        throw queueError;
      }

      return {
        async waitUntilFinished() {
          if (queueError) {
            throw queueError;
          }

          return nextAction;
        },
      };
    },
  },
  commandQueueEvents: {},
});

installModuleStub(loggerModulePath, {
  logError() {},
  logInfo() {},
  logWarn() {},
});

const app = requireFromRoot(appModulePath).default;

beforeEach(() => {
  nextAction = {
    budget: null,
    savings_mode: null,
    search_terms: null,
    text: "No action",
  };
  queueError = null;
  searchResults = [];
  queueAddCalls = [];
  searchCalls = [];
  updateCalls = [];
  cacheDeleteCalls = [];
  supabaseUpdateError = null;
});

after(() => {
  delete requireFromRoot.cache[appModulePath];
  delete requireFromRoot.cache[cacheModulePath];
  delete requireFromRoot.cache[supabaseModulePath];
  delete requireFromRoot.cache[searchServiceModulePath];
  delete requireFromRoot.cache[queueModulePath];
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

function assertCommandShape(body: any) {
  assert.equal(typeof body, "object");
  assert.ok(body);
  assert.ok("budget" in body);
  assert.ok("savings_mode" in body);
  assert.ok("search_terms" in body);
  assert.ok("text" in body);
  assert.ok("results" in body);
  assert.ok(Array.isArray(body.results));
}

test("POST /api/command returns 400 when message is missing", async () => {
  const response = await requestJson("/api/command", { intent: "find" });

  assert.equal(response.status, 400);
  assert.deepEqual(
    Object.keys(response.body).sort(),
    ["details", "error", "ok"],
  );
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "Invalid query parameters");
  assert.ok(response.body.details?.fieldErrors?.message);
  assert.equal(queueAddCalls.length, 0);
});

test('POST /api/command handles "cheapest rice" with find intent', async () => {
  nextAction = {
    budget: null,
    savings_mode: null,
    search_terms: ["rice"],
    text: "Searching for rice prices across stores",
  };
  searchResults = [
    {
      product_id: 11,
      canonical_name: "Brown Rice 2kg",
      category: "grains",
      unit_type: "kg",
      cheapest_price: 650,
      cheapest_store: "Hi-Lo",
      prices: [
        {
          store_id: 3,
          store_name: "Hi-Lo",
          branch: "Cross Roads",
          parish: "Kingston",
          price: 650,
          confidence_score: 8,
          date_recorded: "2026-03-15",
          distance_km: 2.4,
        },
      ],
    },
  ];

  const response = await requestJson("/api/command", {
    message: "cheapest rice",
    intent: "find",
    savingsMode: 2,
    userLat: 18.01,
    userLng: -76.79,
  });

  assert.equal(response.status, 200);
  assertCommandShape(response.body);
  assert.deepEqual(response.body, {
    budget: null,
    savings_mode: null,
    search_terms: ["rice"],
    text: "Searching for rice prices across stores",
    results: searchResults,
  });
  assert.deepEqual(queueAddCalls, [
    {
      name: "run-command",
      payload: {
        message: "cheapest rice",
        intent: "find",
        budget: "",
      },
    },
  ]);
  assert.deepEqual(searchCalls, [
    {
      terms: ["rice"],
      savingsMode: 2,
      userLat: 18.01,
      userLng: -76.79,
    },
  ]);
});

test('POST /api/command handles "my budget is 5000"', async () => {
  nextAction = {
    budget: 5000,
    savings_mode: null,
    search_terms: null,
    text: "Budget set to J$5,000",
  };

  const response = await requestJson("/api/command", {
    message: "my budget is 5000",
    intent: "find",
  });

  assert.equal(response.status, 200);
  assertCommandShape(response.body);
  assert.deepEqual(response.body, {
    budget: 5000,
    savings_mode: null,
    search_terms: null,
    text: "Budget set to J$5,000",
    results: [],
  });
  assert.equal(searchCalls.length, 0);
  assert.equal(updateCalls.length, 0);
  assert.equal(cacheDeleteCalls.length, 0);
});

test('POST /api/command handles "set budget to 4000 and find rice" and persists budget when userId is present', async () => {
  nextAction = {
    budget: 4000,
    savings_mode: 1,
    search_terms: ["rice"],
    text: "Budget set to J$4,000 and searching for rice",
  };
  searchResults = [
    {
      product_id: 11,
      canonical_name: "Brown Rice 2kg",
      category: "grains",
      unit_type: "kg",
      cheapest_price: 640,
      cheapest_store: "MegaMart",
      prices: [
        {
          store_id: 5,
          store_name: "MegaMart",
          branch: "Waterloo",
          parish: "St. Andrew",
          price: 640,
          confidence_score: 9,
          date_recorded: "2026-03-15",
          distance_km: 6.1,
        },
      ],
    },
  ];

  const response = await requestJson("/api/command", {
    message: "set budget to 4000 and find rice",
    intent: "find",
    userId: "00000000-0000-0000-0000-000000000001",
    savingsMode: 0,
  });

  assert.equal(response.status, 200);
  assertCommandShape(response.body);
  assert.deepEqual(response.body, {
    budget: 4000,
    savings_mode: 1,
    search_terms: ["rice"],
    text: "Budget set to J$4,000 and searching for rice",
    results: searchResults,
  });
  assert.deepEqual(updateCalls, [
    {
      client: "admin",
      table: "users",
      payload: { weekly_budget: 4000 },
      column: "id",
      value: "00000000-0000-0000-0000-000000000001",
    },
  ]);
  assert.deepEqual(cacheDeleteCalls, [
    "user:00000000-0000-0000-0000-000000000001",
  ]);
  assert.deepEqual(searchCalls, [
    {
      terms: ["rice"],
      savingsMode: 1,
      userLat: undefined,
      userLng: undefined,
    },
  ]);
});

test("POST /api/command returns 502 when the command provider fails", async () => {
  queueError = new Error("LLM unavailable");

  const response = await requestJson("/api/command", {
    message: "cheapest rice",
    intent: "find",
  });

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    action: "error",
    text: "Command service unavailable.",
    results: [],
  });
  assert.equal(searchCalls.length, 0);
});
