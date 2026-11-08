import { NextResponse } from "next/server";
import { ingestIndiaJobs } from "@/worker/india-stream";
import { invalidateJobsCache } from "@/app/api/jobs/route";

export const maxDuration = 60; // Allow sufficient time for scraping batch

export async function POST() {
  try {
    const result = await ingestIndiaJobs(10);
    invalidateJobsCache();

    return NextResponse.json({
      success: true,
      newInserted: result.newInserted,
      totalScanned: result.totalScanned,
      message:
        result.newInserted > 0
          ? `Successfully ingested ${result.newInserted} new Indian tech jobs!`
          : `Checked ${result.totalScanned} latest postings; all are up to date!`,
    });
  } catch (err: any) {
    console.error("[api/jobs/sync-india] Error syncing Indian jobs:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to sync Indian jobs" },
      { status: 500 }
    );
  }
}
