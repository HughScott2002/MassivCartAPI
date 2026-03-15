import express from "express";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { logError, logInfo, logWarn } from "./utils/logger.js";
import searchRouter from "./api/search.js";
import commandRouter from "./api/command.js";
import dashboardRouter from "./api/dashboard.js";
import receiptRouter from "./api/receipt.js";

const app = express();

const claudeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) =>
    (req.headers["x-user-id"] as string) ||
    (req.ip ? ipKeyGenerator(req.ip) : "anon"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Rate limit exceeded — try again in a minute" },
});

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
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
  });
});

app.use(searchRouter);
app.use(dashboardRouter);
app.use("/api/command", claudeRateLimit);
app.use("/api/receipt", claudeRateLimit);
app.use(commandRouter);
app.use(receiptRouter);

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
