import express from "express";
import cors from "cors";
import { z } from "zod";
import { isRedisReady } from "./db/redis.js";
import { logError, logInfo, logWarn } from "./utils/logger.js";
import searchRouter from "./api/search.js";

const app = express();

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

app.use(searchRouter);

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
