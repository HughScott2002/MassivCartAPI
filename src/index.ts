import "dotenv/config";
import app from "./app.js";
import { connectRedis, disconnectRedis, isRedisReady } from "./redis.js";

const port = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    await connectRedis();
  } catch (error) {
    console.warn("Redis unavailable, continuing without cache", error);
  }

  const server = app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    console.log(`Redis cache ${isRedisReady() ? "enabled" : "disabled"}`);
  });

  const shutdown = async () => {
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

void startServer();
