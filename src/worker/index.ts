/**
 * JobSniper Worker Service — Entry Point
 *
 * This process runs separately from the Next.js web app.
 * Start with: npm run worker:dev
 *
 * Responsibilities:
 * - Schedule periodic polling for each active company
 * - Run BullMQ workers for poll, filter, match, and apply stages
 */

import "dotenv/config";
import prisma from "@/lib/db";
import { pollQueue } from "./workers";
import { ingestIndiaJobs } from "./india-stream";
import { runFullWebCrawl } from "./crawler";

// Import workers to register them (side effect)
import "./workers";

const DEFAULT_POLL_INTERVAL_MINUTES = parseInt(
  process.env.DEFAULT_POLL_INTERVAL_MINUTES ?? "2"
);

// ─── Scheduling State ─────────────────────────────────────────────────────────
const companyTimers = new Map<string, NodeJS.Timeout>();

// ─── Schedule polling for a company ──────────────────────────────────────────
function scheduleCompanyPolling(companyId: string, intervalMinutes: number) {
  // Clear existing timer if any
  const existing = companyTimers.get(companyId);
  if (existing) clearInterval(existing);

  const intervalMs = intervalMinutes * 60 * 1000;

  // Poll immediately on start
  pollQueue
    .add(`poll-${companyId}-initial`, { companyId }, { jobId: `${companyId}-initial` })
    .catch(console.error);

  // Then poll on interval
  const timer = setInterval(() => {
    pollQueue
      .add(`poll-${companyId}-${Date.now()}`, { companyId })
      .catch(console.error);
  }, intervalMs);

  companyTimers.set(companyId, timer);
  console.log(
    `[Scheduler] Company ${companyId}: polling every ${intervalMinutes}m`
  );
}

// ─── Load and schedule all active companies ───────────────────────────────────
async function loadCompanies() {
  const companies = await prisma.company.findMany({
    where: { isActive: true, isPaused: false },
  });

  console.log(`[Scheduler] Scheduling polling for ${companies.length} companies...`);

  for (const company of companies) {
    scheduleCompanyPolling(
      company.id,
      company.pollingIntervalMinutes ?? DEFAULT_POLL_INTERVAL_MINUTES
    );
  }
}

// ─── Refresh company list periodically ───────────────────────────────────────
// This handles newly added companies from the UI without restart
async function refreshScheduler() {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true, isPaused: false },
    });

    const currentIds = new Set(companies.map((c) => c.id));
    const scheduledIds = new Set(companyTimers.keys());

    // Add newly added companies
    for (const company of companies) {
      if (!scheduledIds.has(company.id)) {
        scheduleCompanyPolling(company.id, company.pollingIntervalMinutes);
      }
    }

    // Remove deactivated companies
    for (const id of scheduledIds) {
      if (!currentIds.has(id)) {
        const timer = companyTimers.get(id);
        if (timer) clearInterval(timer);
        companyTimers.delete(id);
        console.log(`[Scheduler] Removed company ${id} from schedule`);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Failed to refresh companies:", err);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 JobSniper Worker Service starting...");
  console.log(`   Node.js: ${process.version}`);
  console.log(`   ENV: ${process.env.NODE_ENV}`);

  // Ensure storage directory exists
  const storagePath = process.env.STORAGE_PATH ?? "./uploads";
  const fs = await import("fs");
  fs.mkdirSync(storagePath, { recursive: true });
  fs.mkdirSync(`${storagePath}/resumes`, { recursive: true });
  fs.mkdirSync(`${storagePath}/screenshots`, { recursive: true });

  // Wait for DB
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  // Start scheduling
  await loadCompanies();

  // Run initial India job ingestion stream
  ingestIndiaJobs(10).catch((err) => console.error("[Worker] Initial India ingestion error:", err));

  // Continuously ingest fresh Indian tech jobs every 5 minutes
  setInterval(() => {
    ingestIndiaJobs(8).catch((err) => console.error("[Worker] Continuous India ingestion error:", err));
  }, 5 * 60 * 1000);

  // Autonomous Full Web Crawler: sweeps LinkedIn (<10h), top tech startups, and aggregators every 15m
  setInterval(() => {
    runFullWebCrawl({ maxHoursAgo: 10, batchSize: 8 }).catch((err) =>
      console.error("[Worker] Autonomous Web Crawler error:", err)
    );
  }, 15 * 60 * 1000);

  // Refresh scheduler every 60 seconds to pick up new/removed companies
  setInterval(refreshScheduler, 60 * 1000);

  console.log("✅ Worker service ready. Polling, India Stream & Web Crawler are active.");
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n[Worker] Shutting down gracefully...");
  for (const timer of companyTimers.values()) clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Worker] SIGTERM received, shutting down...");
  for (const timer of companyTimers.values()) clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});
