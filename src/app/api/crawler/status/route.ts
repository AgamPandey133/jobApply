import { NextResponse } from "next/server";
import { crawlerState } from "@/worker/crawler";

export async function GET() {
  // Map internal CrawlerStatus to UI-friendly shape
  return NextResponse.json({
    isRunning: crawlerState.status === "CRAWLING",
    lastCrawledAt: crawlerState.lastCrawledAt,
    currentSource: crawlerState.currentSource,
    jobsFound: crawlerState.totalJobsScanned,
    jobsIngested: crawlerState.totalNewInserted,
    freshJobsWithin10h: crawlerState.freshJobsWithin10h,
    logs: crawlerState.logs.map((l) => ({
      timestamp: l.timestamp,
      level: l.level,
      source: crawlerState.currentSource ?? "crawler",
      message: l.message,
    })),
  });
}
