import "dotenv/config";
import app from "./app.js";
import { connectRedis, disconnectRedis, isRedisReady } from "./db/redis.js";
import { logError, logInfo, logWarn } from "./utils/logger.js";

const port = Number(process.env.PORT) || 8000;

async function startServer() {
  try {
    await connectRedis();
  } catch (error) {
    logWarn("Redis unavailable, continuing without cache", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const server = app.listen(port, () => {
    logInfo("API server started", {
      port,
      url: `http://localhost:${port}`,
      redisCache: isRedisReady() ? "enabled" : "disabled",
    });
  });

  const shutdown = async () => {
    logInfo("Shutdown signal received");
    server.close(async () => {
      try {
        await disconnectRedis();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("uncaughtException", (error) => {
  logError("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("Unhandled promise rejection", reason);
});

void startServer();
