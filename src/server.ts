import "dotenv/config";
import "./config/env.js";
import app from "./app.js";
import { logError, logInfo } from "./utils/logger.js";

const port = Number(process.env.PORT) || 8000;

async function startServer() {
  const server = app.listen(port, () => {
    logInfo("API server started", {
      port,
      url: `http://localhost:${port}`,
    });
  });

  const shutdown = async () => {
    logInfo("Shutdown signal received");
    server.close(async () => {
      process.exit(0);
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
