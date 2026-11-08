import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { JobStatus } from "@/generated/client";
import { invalidateJobsCache } from "@/app/api/jobs/route";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { jobId, jobIds, reason } = body;
    const ids: string[] = jobIds || (jobId ? [jobId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: "jobId or jobIds is required" }, { status: 400 });
    }

    await prisma.job.updateMany({
      where: { id: { in: ids } },
      data: {
        status: JobStatus.FILTERED,
        filterReason: reason || "User dismissed: Marked as expired / not useful",
      },
    });

    invalidateJobsCache();

    return NextResponse.json({
      success: true,
      count: ids.length,
      message: `${ids.length} job(s) removed from your active feed.`,
    });
  } catch (err: any) {
    console.error("[api/jobs/dismiss] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to dismiss job" },
      { status: 500 }
    );
  }
}
