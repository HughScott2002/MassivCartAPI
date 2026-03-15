import { Queue, Worker, QueueEvents } from "bullmq";
import { getProvider } from "../llm/registry.js";
import { makeCommandRunner } from "../llm/prompts.js";
import { getProducts } from "../db/data-access.js";
import { logError, logInfo } from "../utils/logger.js";

function getRedisConnection() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.password ? { password: parsed.password } : {}),
  };
}

const connection = getRedisConnection();

export const commandQueue = new Queue("claude-commands", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 300 },
    removeOnFail: { age: 600 },
  },
});

export const commandQueueEvents = new QueueEvents("claude-commands", {
  connection,
});

const commandWorker = new Worker(
  "claude-commands",
  async (job) => {
    const { message, intent, budget } = job.data as {
      message: string;
      intent: string;
      budget: string;
    };
    const products = await getProducts();
    const runCommand = makeCommandRunner(getProvider());
    return runCommand(message, { intent, budget }, products);
  },
  { connection, concurrency: 50 },
);

commandWorker.on("failed", (job, err) =>
  logError("Queue job failed", err, { jobId: job?.id }),
);
commandWorker.on("completed", (job) =>
  logInfo("Queue job done", { jobId: job.id }),
);

export async function closeQueue(): Promise<void> {
  await commandWorker.close();
  await commandQueueEvents.close();
  await commandQueue.close();
}
