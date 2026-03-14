import express from "express";
import cors from "cors";
import { z } from "zod";
import { isRedisReady } from "./redis.js";
import { withCache } from "./cache.js";
import { supabase } from "./supabase.js";
import { logError, logInfo, logWarn } from "./logger.js";

const app = express();
const productsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  category: z.string().trim().min(1).optional(),
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    logInfo("HTTP request completed", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Server is running",
    services: {
      redis: isRedisReady() ? "up" : "down",
    },
  });
});

app.get("/products", async (req, res, next) => {
  try {
    const query = productsQuerySchema.parse(req.query);
    const { data, cacheHit, ttlSeconds } = await withCache(
      "products",
      query,
      async () => {
        let supabaseQuery = supabase
          .from("products")
          .select("*")
          .order("id", { ascending: true })
          .limit(query.limit);

        if (query.category) {
          supabaseQuery = supabaseQuery.eq("category", query.category);
        }

        const { data: products, error } = await supabaseQuery;

        if (error) {
          throw error;
        }

        return products ?? [];
      },
    );

    res.status(200).json({
      ok: true,
      cache: {
        hit: cacheHit,
        ttlSeconds,
        provider: isRedisReady() ? "redis" : "none",
      },
      data,
    });

    logInfo("Products fetched", {
      limit: query.limit,
      category: query.category ?? null,
      cacheHit,
      itemCount: data.length,
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      logWarn("Request validation failed", {
        method: req.method,
        path: req.originalUrl,
        details: error.flatten(),
      });

      res.status(400).json({
        ok: false,
        error: "Invalid query parameters",
        details: error.flatten(),
      });
      return;
    }

    const message =
      error instanceof Error ? error.message : "Internal server error";

    logError("Unhandled request error", error, {
      method: req.method,
      path: req.originalUrl,
    });

    res.status(500).json({
      ok: false,
      error: message,
    });
  },
);

export default app;
