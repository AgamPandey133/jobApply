import { NextRequest, NextResponse } from "next/server";
import { runFullWebCrawl, CrawlOptions, crawlerState } from "@/worker/crawler";
import { invalidateJobsCache } from "@/app/api/jobs/route";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body: CrawlOptions = await req.json().catch(() => ({}));

    // If crawler is already actively running, return immediately
    if (crawlerState.status === "CRAWLING") {
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        message: "Web crawler is already in progress. Real-time events are streaming in the terminal below.",
      });
    }

    // Launch background asynchronous execution so HTTP request responds immediately without hanging
    runFullWebCrawl({
      source: body.source || "all",
      maxHoursAgo: body.maxHoursAgo ?? 10,
      batchSize: body.batchSize ?? 8,
      roles: body.roles,
      locations: body.locations,
    })
      .then(() => {
        invalidateJobsCache();
      })
      .catch((err) => {
        console.error("[Crawler background error]:", err);
      });

    return NextResponse.json({
      success: true,
      message: `Web Crawler started for ${body.source || "all"} sources (max ${body.maxHoursAgo ?? 10}h). Live streaming logs below!`,
    });
  } catch (err: any) {
    console.error("[api/crawler/run] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Crawler execution failed" },
      { status: 500 }
    );
  }
}
