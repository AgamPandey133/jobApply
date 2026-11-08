import IORedis from "ioredis";
import { Queue, Worker, QueueEvents } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Shared connection for BullMQ (must not have maxRetriesPerRequest)
export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// General-purpose Redis client for app use (caching, pub/sub)
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 3,
});

// ─── Queue Names ──────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  POLLING: "polling",
  FILTER: "filter",
  MATCH: "match",
  APPLY: "apply",
  NOTIFY: "notify",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Queue Factory ────────────────────────────────────────────────────────────
export function createQueue<T>(name: string) {
  return new Queue<T>(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: { count: 20 },
    },
  });
}

export function createWorker<T>(
  name: string,
  processor: (job: import("bullmq").Job<T>) => Promise<void>,
  concurrency = 1
) {
  return new Worker<T>(name, processor, {
    connection,
    concurrency,
  });
}

export function createQueueEvents(name: string) {
  return new QueueEvents(name, { connection });
}
