import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// In-memory cache for overview data (15s TTL)
let overviewCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 15 * 1000;

export async function GET() {
  const now = Date.now();
  if (overviewCache && now - overviewCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(overviewCache.data, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      statusCounts,
      recentJobs,
      recentApplications,
      recentDetectedJobs,
      recentSubmittedApps,
    ] = await Promise.all([
      // 1 single query for all status counts
      prisma.job.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      // Recent jobs
      prisma.job.findMany({
        take: 50,
        orderBy: { firstSeenAt: "desc" },
        include: {
          company: { select: { id: true, name: true, atsType: true } },
          applications: {
            select: {
              id: true,
              status: true,
              matchScore: true,
              resume: { select: { id: true, label: true, name: true } },
            },
          },
        },
      }),
      // Recent applications
      prisma.application.findMany({
        take: 15,
        orderBy: { createdAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              company: { select: { name: true } },
            },
          },
          resume: { select: { label: true } },
        },
      }),
      // 1 single query for 7-day job activity
      prisma.job.findMany({
        where: { firstSeenAt: { gte: sevenDaysAgo } },
        select: { firstSeenAt: true },
      }),
      // 1 single query for 7-day application activity
      prisma.application.findMany({
        where: {
          status: "SUBMITTED",
          submittedAt: { gte: sevenDaysAgo },
        },
        select: { submittedAt: true },
      }),
    ]);

    // Compute stats map
    const countsMap: Record<string, number> = {};
    let totalJobs = 0;
    for (const sc of statusCounts) {
      countsMap[sc.status] = sc._count.id;
      totalJobs += sc._count.id;
    }

    const stats = {
      totalJobs,
      newJobs: countsMap["NEW"] ?? 0,
      awaitingReview: countsMap["AWAITING_REVIEW"] ?? 0,
      applied: countsMap["APPLIED"] ?? 0,
      failed: countsMap["FAILED"] ?? 0,
      needsManualAction: countsMap["NEEDS_MANUAL_ACTION"] ?? 0,
    };

    // Fast in-memory aggregation for 7-day chart
    const dailyStats = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const detected = recentDetectedJobs.filter(
        (j) => j.firstSeenAt.toISOString().split("T")[0] === dateStr
      ).length;

      const applied = recentSubmittedApps.filter(
        (a) => a.submittedAt && a.submittedAt.toISOString().split("T")[0] === dateStr
      ).length;

      return { date: label, detected, applied };
    });

    const responseData = {
      stats,
      dailyStats,
      recentJobs,
      recentApplications,
    };

    overviewCache = { data: responseData, timestamp: now };
    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (err: any) {
    console.error("[api/overview] Error:", err);
    return NextResponse.json(
      { error: "Failed to load overview data" },
      { status: 500 }
    );
  }
}

